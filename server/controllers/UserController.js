import TokenManager from '../helpers/TokenManager';
import MailManager from '../helpers/MailManager';
import db from '../models';
import PasswordManager from '../helpers/PasswordManager';

import response from '../helpers/response';

import passwordResetEmailTemplate from '../helpers/emailTemplates/resetPasswordTemplate';

const { User, Sequelize } = db;
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
        from: 'notification@neon-ah.com',
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
          password: PasswordManager.hashPassword(newPassword)
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
      if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
        return res.status(401).send({
          status: 'failure',
          data: {
            statusCode: '401',
            message: 'Sorry! Link has expired. Kindly re-initiate password reset.'
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
   * @return {res} res - Response object
   * @memberof userController
   */
  static async signUp(req, res) {
    try {
      const {
        fullName, userName, email, password
      } = req.body;

      const hashedPassword = await PasswordManager.hashPassword(password);

      const foundUser = await User.findOne({ where: { email } });

      if (foundUser) {
        return res.status(409).send({
          status: 'failure',
          data: {
            statusCode: 409,
            message: 'The provided email has been taken. Kingly provide another.'
          }
        });
      }

      const createdUser = await User.create({
        userName,
        fullName,
        email,
        password: hashedPassword,
        roleId: '{3ceb546e-054d-4c1d-8860-e27c209d4ae3}',
        authTypeId: '{15745c60-7b1a-11e8-9c9c-2d42b21b1a3e}'
      });

      const payload = {
        userId: createdUser.id,
        userName: createdUser.userName,
        userEmail: createdUser.email,
        role: createdUser.roleId
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
      return res.status(400).send({
        status: 'failure',
        data: {
          statusCode: 400,
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
      return res.status(400).send({
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
      const { user, password } = req.body;

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
        roleId: foundUser.roleId
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

      const {
        id, displayName, emails, photos, provider
      } = profile;

      const [user] = await User.findOrCreate({
        where: { email: emails[0].value },
        defaults: {
          fullName: displayName,
          userName: `user${id}`,
          password: PasswordManager.hashPassword(id),
          authTypeId: providerList[provider].id,
          roleId: '3ceb546e-054d-4c1d-8860-e27c209d4ae3',
          isVerified: true,
          email: emails[0].value,
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
    const payload = {
      userId: req.user.id,
      userName: req.user.userName,
      userEmail: req.user.email,
      roleId: req.user.roleId
    };
    const token = TokenManager.sign(payload, '1y');
    return res.redirect(`/?token=${token}`);
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
        attributes: ['id', 'fullName', 'userName', 'img', 'bio']
      });

      if (!userProfile) {
        response(res, 404, 'failure', 'User not found');
        return;
      }
      response(res, 200, 'success', 'User retrieved successfully', null, userProfile);
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
        'getEmailsNotification',
        'getInAppNotification',
        'userName'
      ];

      const findProfile = await User.findOne({
        where: { id: req.user.userId },
        attributes: ['id', 'fullName', 'userName', 'img', 'bio']
      });

      if (!findProfile) {
        return response(res, 404, 'failure', 'User not found');
      }

      const checkUserName = await User.findAndCountAll({
        where: { userName: req.body.userName }
      });

      if (checkUserName.count > 0) {
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
        where: { userName }
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
}

export default UserController;
