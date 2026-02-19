/**
 * User management routes.
 * POST /api/users (admin), GET /api/users (admin), PATCH /api/users/:id/deactivate (admin), GET /api/users/me.
 */

import express from 'express';
import { requireAuth, requireAdmin } from '../../middleware/auth.middleware.js';
import * as usersController from './users.controller.js';

const router = express.Router();

router.post('/', requireAuth, requireAdmin, usersController.createUser);
router.get('/', requireAuth, requireAdmin, usersController.listUsers);
router.get('/me', requireAuth, usersController.me);
router.patch('/:id/deactivate', requireAuth, requireAdmin, usersController.deactivateUser);

export default router;
