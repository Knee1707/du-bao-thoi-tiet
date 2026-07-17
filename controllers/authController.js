const { hashPassword, comparePassword, signToken } = require('../middlewares/auth');
const { AppError } = require('../utils/appError');

const users = [];

async function registerController(req, res, next) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required.', 400, 'VALIDATION_ERROR');
    }

    const existingUser = users.find((user) => user.email === email);
    if (existingUser) {
      throw new AppError('Email already exists.', 409, 'USER_EXISTS');
    }

    const user = {
      id: Date.now().toString(),
      email,
      name: name || email,
      password: hashPassword(password)
    };

    users.push(user);

    const token = signToken({ id: user.id, email: user.email, name: user.name });

    res.status(201).json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    next(error);
  }
}

async function loginController(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required.', 400, 'VALIDATION_ERROR');
    }

    const user = users.find((item) => item.email === email);
    if (!user || !comparePassword(password, user.password)) {
      throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    const token = signToken({ id: user.id, email: user.email, name: user.name });

    res.status(200).json({ success: true, token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  registerController,
  loginController
};
