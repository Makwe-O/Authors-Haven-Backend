import db from '../models';
import response from '../helpers/response';
import MailManager from '../helpers/MailManager';
import newCommentTemplate from '../helpers/emailTemplates/newCommentTemplate';
import Util from '../helpers/Util';
import eventHandler from '../helpers/eventsHandler';

const { Article, Comment, User, Notification, Highlight } = db;
/**
 * @class CommentController
 */
class CommentController {
  /**
   *
   * @description Allow user to comment on an article
   * @static
   * @param {*} req Express Request object
   * @param {*} res Express Response object
   * @returns {object} Json response
   * @memberof CommentController
   */
  static async addComment(req, res) {
    try {
      const { userId } = req.user;
      const { content, highlightedText } = req.body;
      const { slug } = req.params;

      const { dataValues: article } = await Article.findOne({
        where: {
          slug
        }
      });

      if (!article) {
        return response(
          res,
          404,
          'failure',
          'Sorry!! Your comment could not be created',
          null,
          null
        );
      }

      const isValidHighlight = article.content.includes(highlightedText);

      if (highlightedText && !isValidHighlight) {
        return response(
          res,
          400,
          'failure',
          'Article does not contain the highlighted text',
          null,
          null
        );
      }

      const getAuthorPromise = User.findOne({ where: { id: article.userId } });
      const getCommenterPromise = User.findOne({ where: { id: userId } });
      const createCommentPromise = Comment.create({
        content,
        userId,
        articleId: article.id
      });

      const [
        { dataValues: articleAuthor },
        { dataValues: createdComment },
        { dataValues: commenter }
      ] = await Promise.all([
        getAuthorPromise,
        createCommentPromise,
        getCommenterPromise
      ]);

      if (isValidHighlight) {
        await Highlight.create({
          articleId: article.id,
          commentId: createdComment.id,
          highlightedText
        });
      }

      const thisComment = await Comment.findOne({
        where: { id: createdComment.id },
        include: [
          {
            model: Highlight,
            as: 'highlight'
          }
        ]
      });

      const { dataValues: notification } = await Notification.create({
        message: `${commenter.fullName} commented on your article`,
        senderId: userId,
        receiverId: articleAuthor.id
      });

      const newCommentMailConfig = {
        to: `${articleAuthor.email}`,
        from: 'notification@authors-haven.com',
        subject: 'New Comment Alert',
        html: newCommentTemplate(articleAuthor, article)
      };

      if (articleAuthor.getEmailsNotification) {
        eventHandler.on('sendMail', MailManager.sendMailNotification);
        eventHandler.emit('sendMail', newCommentMailConfig);
      }

      if (articleAuthor.getInAppNotification) {
        Util.sendInAppNotification([articleAuthor], notification.message);
      }

      response(
        res,
        201,
        'success',
        'Comment created',
        null,
        thisComment.dataValues
      );
    } catch (error) {
      return response(
        res,
        500,
        'failure',
        error,
        { message: 'Something went wrong on the server' },
        null
      );
    }
  }

  /**
   *
   * @description Retrive all comments for an article
   * @static
   * @param {*} req Express Request object
   * @param {*} res Express Response object
   * @returns {object} Json response
   * @memberof CommentController
   */
  static async getComments(req, res) {
    try {
      const { slug } = req.params;
      const articleFound = await Article.findOne({
        where: {
          slug
        }
      });

      if (!articleFound) {
        return response(res, 404, 'failure', 'Article not found', null, null);
      }

      const commentsQuery = await Comment.findAll({
        include: [
          {
            model: User,
            attributes: ['userName', 'img']
          }
        ],
        where: {
          articleId: articleFound.dataValues.id
        },
        attributes: []
      });

      if (commentsQuery.length === 0) {
        return response(
          res,
          404,
          'failure',
          'Comment with the articleId not found',
          null,
          null
        );
      }

      const comments = [];
      commentsQuery.map(comment => comments.push(comment.dataValues));

      return response(res, 200, 'success', 'Comment found', null, comments);
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
   *
   * @description Retrive all comments for an article
   * @static
   * @param {*} req Express Request object
   * @param {*} res Express Response object
   * @returns {object} Json response
   * @memberof CommentController
   */
  static async getSingleComments(req, res) {
    try {
      const { slug, commentId } = req.params;
      const articleFound = await Article.findOne({
        where: {
          slug
        }
      });

      if (!articleFound) {
        return response(res, 404, 'failure', 'Article not found', null, null);
      }

      const comment = await Comment.findOne({
        include: [
          {
            model: User,
            attributes: ['userName', 'img']
          }
        ],
        where: {
          articleId: articleFound.dataValues.id,
          id: commentId
        },
        attributes: []
      });

      if (comment) {
        return response(
          res,
          200,
          'success',
          'Comment found',
          null,
          comment.dataValues
        );
      }
    } catch (error) {
      if (error.name === 'SequelizeDatabaseError' || null) {
        return response(res, 404, 'failure', 'Comment not found', null, null);
      }
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
   *
   * @description Update a comment
   * @static
   * @param {*} req Express Request object
   * @param {*} res Express Response object
   * @returns {object} Json response
   * @memberof CommentController
   */
  static async updateComment(req, res) {
    try {
      const { userId } = req.user;
      const { slug, commentId } = req.params;
      const { content } = req.body;

      const articleFound = await Article.findOne({
        where: {
          slug
        }
      });

      if (!articleFound) {
        return response(
          res,
          404,
          'failure',
          'Sorry, the article was not found - Update Failed',
          null,
          null
        );
      }

      const foundComment = await Comment.findOne({
        where: {
          id: commentId
        },
        attributes: {
          exclude: ['commentId']
        }
      });

      if (!foundComment) {
        return response(
          res,
          404,
          'failure',
          'Update Failed - Comment not found',
          null,
          null
        );
      }

      const { dataValues: existingComment } = foundComment;

      if (existingComment.articleId !== articleFound.id) {
        return response(
          res,
          404,
          'failure',
          'Update Failed - Comment not found',
          null,
          null
        );
      }

      if (existingComment.userId !== userId) {
        return response(
          res,
          403,
          'failure',
          "You are not allowed to update another user's comment",
          null,
          null
        );
      }

      if (content === existingComment.content) {
        return response(
          res,
          200,
          'success',
          'Comment was not edited because content is the same',
          null,
          null
        );
      }

      const newEditHistory = {
        content: existingComment.content,
        updatedAt: existingComment.updatedAt
      };

      existingComment.history = !existingComment.history[0]
        ? (existingComment.history = [newEditHistory])
        : existingComment.history.concat([newEditHistory]);

      const updateComment = await foundComment.update({
        content,
        edited: true,
        history: existingComment.history
      });

      if (updateComment) {
        return response(
          res,
          200,
          'success',
          'Comment updated',
          null,
          updateComment.dataValues
        );
      }
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
   *
   * @description Delete a comment
   * @static
   * @param {*} req Express Request object
   * @param {*} res Express Response object
   * @returns {object} Json response
   * @memberof CommentController
   */
  static async deleteComment(req, res) {
    try {
      const { userId } = req.user;
      const { slug, commentId } = req.params;
      const articleFound = await Article.findOne({
        where: {
          slug
        }
      });
      if (!articleFound) {
        return response(res, 404, 'failure', 'Article not found', null, null);
      }
      const getCommentDelete = await Comment.findOne({
        where: {
          id: commentId
        },
        attributes: {
          exclude: ['commentId']
        }
      });
      if (
        getCommentDelete.dataValues.articleId !== articleFound.dataValues.id
      ) {
        return response(
          res,
          404,
          'failure',
          'Comment not found for article id',
          null,
          null
        );
      }
      if (getCommentDelete.dataValues.userId !== userId) {
        return response(
          res,
          403,
          'failure',
          "You are not allowed to delete another user's comment",
          null,
          null
        );
      }
      const deleteComment = await getCommentDelete.destroy();
      if (deleteComment) {
        return response(res, 200, 'success', 'Comment deleted', null, null);
      }
    } catch (error) {
      if (error.name === 'SequelizeDatabaseError') {
        return response(res, 404, 'failure', 'Comment not found', null, null);
      }
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
export default CommentController;
