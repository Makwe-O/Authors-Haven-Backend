/* eslint-disable max-len */
import TokenManager from '../helpers/TokenManager';
import MailManager from '../helpers/MailManager';
import db from '../models';
import PasswordManager from '../helpers/PasswordManager';
import 'dotenv/config';
import response from '../helpers/response';
import pagination from '../helpers/pagination';
import passwordResetEmailTemplate from '../helpers/emailTemplates/resetPasswordTemplate';

const { User, Article, Sequelize, Notification } = db;
const { Op } = Sequelize;

/**
 * @class UserController
 */
class UserController {
  /**
   *
   * @description Method to send password reset link.
   * @static
   * @param {*} req Express Request object
   * @param {*} res Express Response object
   * @returns {object} Json response
   * @memberof UserController
   */
  static async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      const user = await User.findOne({
        where: {
          email
        }
      });
      if (!user) {
        return res.status(404).json({
          status: 'failure',
          data: {
            statusCode: 404,
            message: 'User not found'
          }
        });
      }

      const token = TokenManager.sign(
        {
          email
        },
        '24h'
      );

      const passwordResetEmail = {
        to: `${user.email}`,
        from: 'notification@authors-haven.com',
        subject: 'Password Reset Link',
        html: passwordResetEmailTemplate(user, token)
      };

      await MailManager.sendMailNotification(passwordResetEmail);

      res.status(200).json({
        status: 'success',
        data: {
          statusCode: '200',
          message: 'Kindly check your mail to reset your password'
        }
      });
    } catch (error) {
      res.status(500).send({
        status: 'failure',
        data: {
          statusCode: 500,
          error
        }
      });
    }
  }

  /**
   * @description Method to reset user's password.
   * @static
   * @param {*} req Express Request object
   * @param {*} res Express Response object
   * @returns {object} Json response
   * @memberof UserController
   */
  static async passwordReset(req, res) {
    try {
      const { token } = req.params;

      const { email } = TokenManager.verify(token);

      const { newPassword, confirmPassword } = req.body;
      const isPasswordEqual = newPassword === confirmPassword;

      if (!isPasswordEqual) {
        return res.status(400).json({
          status: 'failure',
          data: {
            statusCode: 400,
            message: 'Password does not match'
          }
        });
      }

      const user = await User.findOne({ where: { email } });

      if (!user) {
        return res.status(404).json({
          status: 'failure',
          data: {
            statusCode: 404,
            message: 'User not found'
          }
        });
      }

      await User.update(
        {
          password: await PasswordManager.hashPassword(newPassword)
        },
        {
          where: {
            email
          }
        }
      );

      res.status(200).json({
        status: 'success',
        data: {
          statusCode: '200',
          message: 'Password has been successfully updated. Kindly login.'
        }
      });
    } catch (error) {
      if (
        error.name === 'TokenExpiredError' ||
        error.name === 'JsonWebTokenError'
      ) {
        return res.status(401).send({
          status: 'failure',
          data: {
            statusCode: '401',
            message:
              'Sorry! Link has expired. Kindly re-initiate password reset.'
          }
        });
      }
      res.status(500).send({
        status: 'failure',
        data: {
          statusCode: 500,
          message: error
        }
      });
    }
  }

  /**
   * @static
   * @param {object} req - request object
   * @param {object} res - response object
   * @return {object} A JSON Response object
   * @memberof userController
   */
  static async signUp(req, res) {
    try {
      const { fullName, userName, email, password } = req.body;

      const foundUser = await User.findOne({
        where: {
          [Op.or]: [{ email }, { userName }]
        }
      });

      if (foundUser) {
        if (foundUser.userName === userName) {
          return res.status(409).send({
            status: 'failure',
            data: {
              statusCode: 409,
              message: 'Username has already been taken'
            }
          });
        }

        if (foundUser.email === email) {
          return res.status(409).send({
            status: 'failure',
            data: {
              statusCode: 409,
              message: 'Email has already been taken'
            }
          });
        }
      }

      const hashedPassword = await PasswordManager.hashPassword(password);
      const createdUser = await User.create({
        userName: userName.toLowerCase(),
        fullName: fullName.toLowerCase(),
        email: email.toLowerCase(),
        password: hashedPassword,
        roleId: '{3ceb546e-054d-4c1d-8860-e27c209d4ae3}',
        authTypeId: '{15745c60-7b1a-11e8-9c9c-2d42b21b1a3e}',
        img:
          'https://res.cloudinary.com/jesseinit/image/upload/v1551253945/neon-ah/defaultUserProfileImage.svg'
      });

      const payload = {
        userId: createdUser.id,
        userName: createdUser.userName,
        userEmail: createdUser.email,
        role: createdUser.roleId,
        img: createdUser.img
      };

      const token = await TokenManager.sign(payload, '1y');
      await MailManager.sendVerificationEmail({ createdUser, token });
      return res.status(201).send({
        status: 'success',
        data: {
          statusCode: 201,
          message: 'Kindly your check your email to verify your account'
        }
      });
    } catch (err) {
      res.status(500).send({
        status: 'failure',
        data: {
          statusCode: 500,
          error: err.message
        }
      });
    }
  }

  /**
   * @static
   * @param {*} req - request object
   * @param {*} res - response object
   * @returns {object} - response object containing user payload.
   * @memberof UserController
   */
  static async verifyEmail(req, res) {
    try {
      const { token } = req.params;
      const { userEmail } = TokenManager.verify(token);

      const foundUser = await User.findOne({ where: { email: userEmail } });

      if (foundUser.isVerified) {
        return res.status(409).send({
          status: 'failure',
          data: {
            statusCode: 409,
            error: 'Your account has already been activated.'
          }
        });
      }

      await User.update({ isVerified: true }, { where: { email: userEmail } });

      return res.status(200).send({
        status: 'success',
        data: {
          statusCode: 200,
          token,
          message: 'Your account has now been verified'
        }
      });
    } catch (err) {
      if (err.name === 'JsonWebTokenError') {
        return res.status(400).send({
          status: 'failure',
          data: {
            statusCode: 400,
            error: 'The Verification link has expired.'
          }
        });
      }
      return res.status(500).send({
        status: 'failure',
        data: {
          statusCode: 500,
          error: err
        }
      });
    }
  }

  /**
   * @static
   * @param {*} req - request object
   * @param {*} res - response object
   * @returns {object} - JSON response object.
   * @memberof UserController
   */
  static async resendVerificationEmail(req, res) {
    try {
      const { email } = req.body;
      const foundUser = await User.findOne({ where: { email } });

      if (!foundUser) {
        return res.status(404).send({
          status: 'failure',
          data: {
            statusCode: 404,
            message: 'This email address does not exist. Kindly sign up'
          }
        });
      }

      const token = TokenManager.sign({ userEmail: email }, '24h');

      await MailManager.sendVerificationEmail({
        createdUser: foundUser,
        token
      });

      return res.status(200).send({
        status: 'success',
        data: {
          statusCode: 200,
          message: 'Kindly your check your email to verify your account'
        }
      });
    } catch (err) {
      res.status(500).send({
        status: 'failure',
        data: {
          error: err
        }
      });
    }
  }

  /**
   * @static
   * @param {*} req Request
   * @param {*} res Response
   * @returns {object} Json response
   * @memberof Auth
   */
  static async logIn(req, res) {
    try {
      const { password } = req.body;
      let { user } = req.body;
      user = user.toLowerCase();

      const foundUser = await User.findOne({
        where: {
          [Op.or]: [{ email: user }, { userName: user }]
        }
      });

      if (!foundUser) {
        return res.status(404).send({
          status: 'failure',
          data: {
            statusCode: 404,
            message: 'Sorry!!, Your login information is not correct.'
          }
        });
      }
      const isValidPassword = PasswordManager.verifyPassword(
        password,
        foundUser.dataValues.password
      );

      if (!isValidPassword) {
        return res.status(401).send({
          status: 'failure',
          data: {
            statusCode: 401,
            message: 'Sorry!!, Your login information is not correct.'
          }
        });
      }

      if (foundUser.dataValues.isVerified !== true) {
        return res.status(401).send({
          status: 'failure',
          data: {
            statusCode: 401,
            message: 'Your account has not been verified'
          }
        });
      }

      const payload = {
        userId: foundUser.id,
        userName: foundUser.userName,
        userEmail: foundUser.email,
        roleId: foundUser.roleId,
        img: foundUser.img
      };

      const token = TokenManager.sign(payload);
      return res.status(200).send({
        status: 'success',
        data: {
          statusCode: 200,
          message: 'You have successfully logged in',
          token
        }
      });
    } catch (error) {
      return res.status(400).send(error);
    }
  }

  /**
   *
   *
   * @static
   * @param {string} accessToken
   * @param {string} refreshToken
   * @param {string} profile
   * @param {function} done
   * @returns {object} User Object
   * @memberof UserController
   */
  static async strategyCallback(accessToken, refreshToken, profile, done) {
    try {
      const providerList = {
        google: {
          id: '25745c60-7b1a-11e8-9c9c-2d42b21b1a3e',
          type: 'google'
        },
        facebook: {
          id: '35745c60-7b1a-11e8-9c9c-2d42b21b1a3e',
          type: 'facebook'
        },
        twitter: {
          id: '45745c60-7b1a-11e8-9c9c-2d42b21b1a3e',
          type: 'twitter'
        },
        linkedin: {
          id: '55745c60-7b1a-11e8-9c9c-2d42b21b1a3e',
          type: 'linkedin'
        }
      };

      const { id, displayName, emails, photos, provider } = profile;

      if (!emails) {
        const userWithNoEmail = { hasNoEmail: true };
        return done(null, userWithNoEmail);
      }

      const emailValue = emails[0].value.toLowerCase();

      const [user] = await User.findOrCreate({
        where: { email: emailValue },
        defaults: {
          fullName: displayName.toLowerCase(),
          userName: `user${id}`,
          password: await PasswordManager.hashPassword(id),
          authTypeId: providerList[provider].id,
          roleId: '3ceb546e-054d-4c1d-8860-e27c209d4ae3',
          isVerified: true,
          email: emailValue,
          img: photos[0].value
        }
      });

      return done(null, user.dataValues);
    } catch (error) {
      return done(error, null);
    }
  }

  /**
   *
   * @description Handles social auth method and returns a token
   * @static
   * @param {*} req
   * @param {*} res
   * @returns {object} Json Resonse
   * @memberof UserController
   */
  static handleSocialAuth(req, res) {
    if (req.user.hasNoEmail) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/auth/social?error=${400}`
      );
    }
    const payload = {
      userId: req.user.id,
      userName: req.user.userName.toLowerCase(),
      userEmail: req.user.email.toLowerCase(),
      roleId: req.user.roleId,
      img: req.user.img
    };
    const token = TokenManager.sign(payload);
    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/social?token=${token}`
    );
  }

  /**
   *@description Method to get users by username
   * @static
   * @param {*} req express Request object
   * @param {*} res express Response object
   * @returns {object} Json response
   * @memberof UserController
   */
  static async getProfile(req, res) {
    try {
      const { userName } = req.params;
      const userProfile = await User.findOne({
        where: { userName },
        attributes: [
          'id',
          'fullName',
          'userName',
          'img',
          'bio',
          'email',
          'getEmailsNotification',
          'getInAppNotification'
        ],
        include: [
          {
            model: Article,
            as: 'articles'
          },
          {
            model: User,
            through: 'Follow',
            as: 'following',
            attributes: ['id', 'fullName', 'userName', 'img', 'bio']
          },
          {
            model: User,
            through: 'Follow',
            as: 'followers',
            attributes: ['id', 'fullName', 'userName', 'img', 'bio']
          }
        ]
      });

      if (!userProfile) {
        response(res, 404, 'failure', 'User not found');
        return;
      }
      response(
        res,
        200,
        'success',
        'User retrieved successfully',
        null,
        userProfile
      );
    } catch (error) {
      response(res, 500, 'failure', 'An error occured on the server');
    }
  }

  /**
   *@description Method to get users by username
   * @static
   * @param {*} req express Request object
   * @param {*} res express Response object
   * @returns {object} Json response
   * @memberof UserController
   */
  static async getProfileById(req, res) {
    try {
      const id = req.user.userId;
      const userProfile = await User.findOne({
        where: { id },
        attributes: [
          'id',
          'fullName',
          'userName',
          'img',
          'bio',
          'email',
          'getEmailsNotification',
          'getInAppNotification'
        ],
        include: [
          {
            model: Article,
            as: 'articles'
          },
          {
            model: User,
            through: 'Follow',
            as: 'following',
            attributes: ['id', 'fullName', 'userName', 'img', 'bio']
          },
          {
            model: User,
            through: 'Follow',
            as: 'followers',
            attributes: ['id', 'fullName', 'userName', 'img', 'bio']
          }
        ]
      });

      if (!userProfile) {
        response(res, 404, 'failure', 'User not found');
        return;
      }
      response(
        res,
        200,
        'success',
        'User retrieved successfully',
        null,
        userProfile
      );
    } catch (error) {
      response(res, 500, 'failure', 'An error occured on the server');
    }
  }

  /**
   *
   *@description Method to update user's profile
   * @static
   * @param {*} req
   * @param {*} res
   * @returns {object} Json response
   * @memberof UserController
   */
  static async updateProfile(req, res) {
    try {
      const editableFeilds = [
        'fullName',
        'img',
        'bio',
        'email',
        'getEmailsNotification',
        'getInAppNotification',
        'userName'
      ];

      const findProfile = await User.findOne({
        where: { id: req.user.userId },
        attributes: ['id', 'fullName', 'userName', 'img', 'bio', 'email']
      });

      if (!findProfile) {
        return response(res, 404, 'failure', 'User not found');
      }

      req.body.userName = req.body.userName.toLowerCase();
      const checkUserName = await User.findOne({
        where: { id: req.user.userId }
      });

      if (
        checkUserName.dataValues.userName &&
        checkUserName.dataValues.id !== req.user.userId
      ) {
        return response(res, 409, 'failure', 'Username already exists');
      }

      if (req.user.authTypeId === '15745c60-7b1a-11e8-9c9c-2d42b21b1a3e') {
        await findProfile.update(req.body, {
          fields: [...editableFeilds, 'passsword']
        });
        return response(res, 200, 'success', 'Profile updated successfully');
      }

      const updatedProfile = await findProfile.update(req.body, {
        fields: [...editableFeilds]
      });
      return response(
        res,
        200,
        'success',
        'Profile updated successfully',
        null,
        updatedProfile.dataValues
      );
    } catch (error) {
      return response(res, 500, 'failure', 'An error occured on the server');
    }
  }

  /**
   *
   * @static
   * @description - This method upgrades a user to admin. It accessible only to the superadmin.
   * @param {object} req - The request object.
   * @param {object} res - The response object.
   * @returns {object} Json response
   * @memberof UserController
   */
  static async toggleUserToAdmin(req, res) {
    try {
      const adminRole = { roleId: '3ceb546e-054d-4c1d-8860-e27c209d4ae4' };
      const userRole = { roleId: '3ceb546e-054d-4c1d-8860-e27c209d4ae3' };
      const { userName } = req.params;
      const user = await User.findOne({
        where: { userName: userName.toLowerCase() }
      });

      if (!user) {
        return response(res, 404, 'failure', 'This User is not found');
      }
      if (user && user.roleId === '3ceb546e-054d-4c1d-8860-e27c209d4ae4') {
        const updatedUser = await user.update(userRole, {
          fields: ['roleId']
        });
        return response(
          res,
          200,
          'success',
          'The User role has been downgraded to User',
          null,
          updatedUser.dataValues
        );
      }

      const updatedUser = await user.update(adminRole, {
        fields: ['roleId']
      });
      return response(
        res,
        200,
        'success',
        'The User role has been upgraded to Admin',
        null,
        updatedUser.dataValues
      );
    } catch (err) {
      return response(
        res,
        500,
        'failure',
        null,
        'An error occured on the server. Please try again later'
      );
    }
  }

  /**
   * @static
   * @description this handles the fetching of all notifications for a user
   * @param {object} req HTTP request object
   * @param {object} res HTTP response object
   * @returns {object} api route response with the user's notifications
   */
  static async fetchNotifications(req, res) {
    try {
      const { userId } = req.user;
      const { read, unread, page } = req.query;
      const limit = Number(req.query.limit) || 20;
      const currentPage = Number(page) || 1;
      const offset = (currentPage - 1) * limit;
      const notifications = await Notification.findAll({
        where: { receiverId: userId },
        limit,
        offset
      });

      if (notifications.length > 0) {
        let notificationList = notifications;

        if (read === '') {
          notificationList = notifications.filter(
            notification => notification.isRead === true
          );
        } else if (unread === '') {
          notificationList = notifications.filter(
            notification => notification.isRead === false
          );
        }

        const paginatedData = pagination(
          notificationList.length,
          limit,
          currentPage,
          notificationList.length
        );
        const data = {
          notifications: notificationList,
          paginatedData
        };

        return response(
          res,
          200,
          'success',
          'All User notifications',
          null,
          data
        );
      }
      return response(res, 200, 'success', 'You have no notifications yet');
    } catch (error) {
      return response(
        res,
        500,
        'failure',
        'server error',
        { message: 'Something went wrong on the server' },
        null
      );
    }
  }

  /**
   * @static
   * @description this handles the update of a notification when read
   * @param {object} req HTTP request object
   * @param {object} res HTTP response object
   * @returns {object} api route response with the user's notifications
   */
  static async updateNotification(req, res) {
    try {
      const { userId } = req.user;
      const { notificationId } = req.params;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      if (!notificationId.match(uuidPattern)) {
        return response(res, 400, 'failure', 'Notification id is invalid');
      }

      const result = await Notification.findOne({
        where: {
          id: notificationId,
          receiverId: userId
        }
      });

      if (result) {
        let notification = await result.update(
          { isRead: true },
          { fields: Object.keys({ isRead: true }) }
        );
        notification = notification.toJSON();
        return response(
          res,
          200,
          'success',
          'Notification was updated successfully',
          null,
          notification
        );
      }
      return response(res, 404, 'failure', 'Notification does not exist');
    } catch (error) {
      return response(
        res,
        500,
        'failure',
        'server error',
        { message: 'Something went wrong on the server' },
        null
      );
    }
  }
}

export default UserController;
