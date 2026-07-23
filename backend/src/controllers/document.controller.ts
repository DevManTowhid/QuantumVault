import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
// Assuming you have a Redis client and PostgreSQL pool/client configured in your project
import redisClient from '../utils/redis.js';
import pool from '../utils/db.js';

// 1. Zod schema for validating the request parameter
const GetDocumentParamsSchema = z.object({
  id: z.string().uuid({ message: "Invalid document ID format" }),
});

export const getDocumentById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 2. Extract tenant and user context from the authenticated request (set by auth middleware)
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;

    if (!tenantId || !userId) {
      res.status(401).json({ status: "error", message: "Unauthorized: Missing tenant or user context" });
      return;
    }

    // 3. Extract and validate route parameters
    const validationResult = GetDocumentParamsSchema.safeParse(req.params);
    if (!validationResult.success) {
      res.status(400).json({
        status: "error",
        message: validationResult.error.errors[0].message,
      });
      return;
    }

    const { id: documentId } = validationResult.data;

    // 4. Construct the Redis cache key with tenant isolation
    const cacheKey = `doc:cache:${tenantId}:${documentId}`;

    // 5. Query Redis Cache (Cache-Aside: Hit Path)
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      const document = JSON.parse(cachedData);

      // Verify user permission from the cached access control matrix
      const userAccess = document.collaborators?.find((c: any) => c.userId === userId);
      if (!userAccess && document.ownerId !== userId) {
        res.status(403).json({ status: "error", message: "Forbidden: Access denied" });
        return;
      }

      res.status(200).json({
        status: "success",
        data: {
          id: document.id,
          title: document.title,
          content_encrypted: document.content_encrypted,
          encryption_iv: document.encryption_iv,
          accessLevel: document.ownerId === userId ? 'owner' : userAccess?.accessLevel,
        },
      });
      return;
    }

    // 6. Cache Miss Path: Fall through to PostgreSQL with Row-Level Security (RLS)
    const client = await pool.connect();
    try {
      // Set local transaction variables for PostgreSQL RLS policies
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);

      // Execute query (RLS will handle row isolation automatically)
      const queryText = `
        SELECT d.id, d.title, d.content_encrypted, d.encryption_iv, d.owner_id,
               COALESCE(da.access_level, CASE WHEN d.owner_id = $2 THEN 'owner' ELSE NULL END) as access_level
        FROM documents d
        LEFT JOIN document_access da ON d.id = da.document_id AND da.user_id = $2
        WHERE d.id = $1 AND d.is_deleted = FALSE
      `;
      const result = await client.query(queryText, [documentId, userId]);

      if (result.rows.length === 0) {
        // Return 404 to prevent resource existence leakage across tenants
        res.status(404).json({ status: "error", message: "Document not found" });
        return;
      }

      const row = result.rows[0];

      const documentPayload = {
        id: row.id,
        title: row.title,
        content_encrypted: row.content_encrypted.toString('hex'), // Assuming BYTEA storage
        encryption_iv: row.encryption_iv.toString('hex'),
        ownerId: row.owner_id,
        accessLevel: row.access_level,
      };

      // 7. Populate Redis Cache with a 1-hour TTL (3600 seconds)
      await redisClient.setex(cacheKey, 3600, JSON.stringify(documentPayload));

      // 8. Send Success Response
      res.status(200).json({
        status: "success",
        data: {
          id: documentPayload.id,
          title: documentPayload.title,
          content_encrypted: documentPayload.content_encrypted,
          encryption_iv: documentPayload.encryption_iv,
          accessLevel: documentPayload.accessLevel,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    // Forward unexpected errors to the global centralized error-handling middleware
    next(error);
  }
};