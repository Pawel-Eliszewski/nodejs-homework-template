import jwt from "jsonwebtoken";
import Jimp from "jimp";
import { nanoid } from "nanoid";
import gravatar from "gravatar";
import fs from "fs/promises";
import path from "path";
import "dotenv/config";
import usersService from "../services/users.js";
import User from "../models/user.js";
import { storeAvatars } from "../utils/manageUploadFolders.js";
import {
  userRegisterSchema,
  userReverifySchema,
  userLoginSchema,
  userLogoutSchema,
  userUpdateAvatarSchema,
  userUpdateSubSchema,
} from "../utils/validation.js";
import sendEmail from "../utils/sendEmail.js";

const secret = process.env.SECRET_KEY;

const getAll = async (req, res, next) => {
  try {
    const { pagination } = req;
    const { startIndex, endIndex } = pagination;
    const results = await usersService.getAll();
    const users = results.slice(startIndex, endIndex);
    return res.json({
      status: "success",
      code: 200,
      data: {
        users: users,
      },
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const getById = async (req, res, next) => {
  try {
    const { params, user } = req;
    const { id } = params;
    const results = await usersService.getOne(id, user.id);
    if (!results) {
      return res.status(404).json({
        status: "not-found",
        code: 404,
        data: {
          user: results,
        },
      });
    }
    return res.json({
      status: "success",
      code: 200,
      data: {
        user: results,
      },
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const getCurrent = async (req, res, next) => {
  try {
    const results = req.user;
    if (!results) {
      return res.status(404).json({
        status: "not-found",
        code: 404,
        data: {
          user: req.user,
        },
      });
    }
    return res.json({
      status: "success",
      code: 200,
      data: {
        user: req.user,
      },
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const register = async (req, res, next) => {
  const { email, password } = req.body;
  const { error } = userRegisterSchema.validate(req.body);
  if (error?.message) {
    return res.status(400).send({ error: error.message });
  }
  const user = await User.findOne({ email }).lean();

  if (user) {
    return res.status(409).json({
      status: "error",
      code: 409,
      message: "Email is already in use",
      data: "Conflict",
    });
  }
  try {
    const newUser = new User({ email });
    newUser.setPassword(password);

    const verificationToken = nanoid();
    newUser.set("verificationToken", verificationToken);

    sendEmail(email, verificationToken);

    const avatarURL = gravatar.url(email, { s: "250", r: "pg", d: "mp" }, true);
    newUser.set("avatarURL", avatarURL);

    await newUser.save();
    return res.json({
      status: "success",
      code: 201,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          subscription: newUser.subscription,
          avatarURL: avatarURL,
          verificationToken: verificationToken,
        },
        message: "Registration successful",
      },
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const verify = async (req, res, next) => {
  const { verificationToken } = req.params;
  const user = await User.findOne({ verificationToken });

  if (!user) {
    return res.status(404).json({
      status: "Bad request",
      code: 404,
      message: "Not found",
    });
  }
  try {
    await usersService.update(user.id, {
      verify: true,
      verificationToken: null,
    });
    return res.json({
      status: "success",
      code: 200,
      message: "Verification successful",
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const reverify = async (req, res, next) => {
  const { email } = req.body;
  const { error } = userReverifySchema.validate(req.body);
  if (error?.message) {
    return res.status(400).send({ error: error.message });
  }
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({
      status: "Bad request",
      code: 404,
      message: "Not found",
    });
  }
  if (user.verify) {
    return res.status(400).json({
      status: "Bad request",
      code: 400,
      message: "Verification has already been passed",
    });
  }
  try {
    const verificationToken = nanoid();
    user.set("verificationToken", verificationToken);
    sendEmail(email, verificationToken);
    return res.json({
      status: "Success",
      code: 200,
      message: "Verification email sent",
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const login = async (req, res, next) => {
  const { email, password } = req.body;
  const { error } = userLoginSchema.validate(req.body);
  if (error?.message) {
    return res.status(400).send({ error: error.message });
  }
  const user = await User.findOne({ email });

  if (!user || !user.validPassword(password) || !user.verify) {
    return res.status(401).json({
      status: "Unauthorized",
      code: 401,
      message: "Email or password is wrong or user is not verified",
    });
  }

  const payload = {
    id: user.id,
    email: user.email,
    subscription: user.subscription,
  };

  try {
    const token = jwt.sign(payload, secret, { expiresIn: "1h" });
    await usersService.update(user.id, { token: token });
    return res.json({
      status: "Success",
      code: 200,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          subscription: user.subscription,
        },
      },
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const logout = async (req, res, next) => {
  try {
    const { id } = req.user;
    const { error } = userLogoutSchema.validate(req.body);
    if (error?.message) {
      return res.status(400).send({ error: error.message });
    }
    await usersService.update(id, { token: null });
    return res.json({
      status: "No content",
      code: 204,
      message: "Logout successful. Token removed",
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.user;
    const { body } = req;
    const results = await usersService.update(id, body);
    return res.json({
      status: "Success",
      code: 200,
      data: {
        user: results,
      },
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const updateSubscription = async (req, res, next) => {
  try {
    const { id } = req.user;
    const { subscription } = req.body;
    const { error } = userUpdateSubSchema.validate(req.body);
    if (error?.message) {
      return res.status(400).send({ error: error.message });
    }
    const results = await usersService.update(id, {
      subscription: subscription,
    });
    return res.json({
      status: "Success",
      code: 200,
      data: {
        user: results,
      },
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const updateAvatar = async (req, res, next) => {
  try {
    const { id } = req.user;
    const { originalname, path: tmpFile } = req.file;
    const { error } = userUpdateAvatarSchema.validate(originalname);
    if (error?.message) {
      return res.status(400).send({ error: error.message });
    }
    try {
      const avatar = await Jimp.read(tmpFile);
      const files = await fs.readdir(storeAvatars);

      for (const file of files) {
        if (file.startsWith(id)) {
          await fs.rm(path.join(storeAvatars, file));
        }
      }

      avatar.resize(250, 250);
      const avatarName = `${id}_${originalname}`;
      await avatar.writeAsync(path.join(storeAvatars, avatarName));
      await fs.rm(tmpFile);
      const newAvatarUrl = path.join(
        `http://localhost:${process.env.PORT}`,
        "avatars",
        avatarName
      );

      await usersService.update(id, {
        avatarURL: newAvatarUrl,
      });
      return res.json({
        status: "Success",
        code: 200,
        data: {
          avatarURL: newAvatarUrl,
        },
      });
    } catch (e) {
      await fs.rm(tmpFile);
      console.error(e);
      next(e);
    }
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const remove = async (req, res, next) => {
  try {
    const { id } = req.user;
    await usersService.remove(id);
    return res.json({
      status: "Success",
      code: 200,
      data: {
        user: id,
      },
      message: "User removed",
    });
  } catch (e) {
    console.error(e);
    next(e);
  }
};

const usersController = {
  getAll,
  getById,
  getCurrent,
  register,
  verify,
  reverify,
  login,
  logout,
  update,
  updateSubscription,
  updateAvatar,
  remove,
};

export default usersController;
