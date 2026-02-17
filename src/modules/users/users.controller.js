/**
 * Users controller: create (admin), list (admin), deactivate (admin), me.
 */

import bcrypt from 'bcrypt';
import User from './user.model.js';
import { logInfo, logWarn } from '../../utils/logger.js';

export async function createUser(req, res) {
  try {
    const { user_id, name, password } = req.body;
    if (!user_id || !name || !password) {
      return res.status(400).json({
        success: false,
        message: 'user_id, name, and password are required',
      });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      user_id,
      name,
      password_hash,
      role: 'USER',
      status: 'ACTIVE',
      created_by: req.auth.userId,
    });

    logInfo('Users', 'User created', { user_id: user.user_id, created_by: req.auth.userId });

    return res.status(201).json({
      success: true,
      user: {
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'user_id or email already exists',
      });
    }
    logWarn('Users', 'Create user error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to create user' });
  }
}

export async function listUsers(req, res) {
  try {
    const users = await User.findAll({
      attributes: ['id', 'user_id', 'name', 'email', 'role', 'status', 'created_at'],
      order: [['created_at', 'DESC']],
    });
    return res.json({ success: true, users });
  } catch (err) {
    logWarn('Users', 'List users error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to list users' });
  }
}

export async function deactivateUser(req, res) {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.role === 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Cannot deactivate ADMIN' });
    }
    await user.update({ status: 'INACTIVE' });
    logInfo('Users', 'User deactivated', { user_id: user.user_id });
    return res.json({
      success: true,
      user: {
        id: user.id,
        user_id: user.user_id,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    logWarn('Users', 'Deactivate user error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to deactivate user' });
  }
}

export async function me(req, res) {
  try {
    const user = await User.findByPk(req.auth.userId, {
      attributes: ['id', 'user_id', 'name', 'email', 'role', 'status', 'created_at'],
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, user: user.get({ plain: true }) });
  } catch (err) {
    logWarn('Users', 'Me error', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
}
