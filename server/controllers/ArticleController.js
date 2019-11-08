import db from '../models';
import ArticleHelper from '../helpers/ArticleHelper';
import Util from '../helpers/Util';
import TagHelper from '../helpers/TagHelper';
import response from '../helpers/response';
import pagination from '../helpers/pagination';
import TimeToRead from '../helpers/TimeToRead';
import ReadingStatsContoller from './ReadingStatsController';
import eventHandler from '../helpers/eventsHandler';
import MailManager from '../helpers/MailManager';
import newArticleTemplate from '../helpers/emailTemplates/newArticleTemplate';
import TokenManager from '../helpers/TokenManager';
import SearchController from './SearchController';

const {
  Article,
  Tag,
  User,
  Follow,
  Comment,
  Notification,
  Sequelize,
  Highlight
} = db;
const { Op } = Sequelize;
const { createReadingStats } = ReadingStatsContoller;

/**
 * @class ArticleController
 */
class ArticleController {
  /**
   * @static
   * @description a function that handles addition of new article to the db
   * @param {object} req HTTP request object
   * @param {object} res HTTP response object
   * @returns {object} api route response with created article info
   */
  static async create(req, res) {
    try {
      const { userId, userName } = req.user;
      const { title, content, isPublished, banner, tagsList } = req.body;
      const tagsArray = tagsList ? Util.createArrayOfStrings(tagsList) : [];

      const articleData = {
        userId,
        slug: ArticleHelper.generateArticleSlug(title),
        title,
        content,
        banner:
          banner ||
          'https://res.cloudinary.com/jesseinit/image/upload/v1548941969/photo-1476242906366-d8eb64c2f661.jpg',
        tagsList: tagsArray,
        isPublished: Boolean(isPublished),
        isReported: false
      };

      let article = await Article.create(articleData);

      const myFollowersList = await Follow.findAll({
        where: { userId },
        include: [
          {
            model: User,
            as: 'followingUser',
            attributes: [
              'id',
              'fullName',
              'email',
              'getEmailsNotification',
              'getInAppNotification'
            ]
          }
        ]
      });

      const myFollowers = myFollowersList.map(
        user => user.dataValues.followingUser.dataValues
      );

      if (articleData.isPublished) {
        myFollowers.forEach(async follower => {
          await Notification.create({
            message: `${userName} just published a new article`,
            senderId: userId,
            receiverId: follower.id
          });

          const newArticleMailConfig = {
            to: `${follower.email}`,
            from: 'notification@authors-haven.com',
            subject: 'New Article Alert',
            html: newArticleTemplate(follower, articleData, userName)
          };

          if (follower.getEmailsNotification) {
            eventHandler.on('sendMail', MailManager.sendMailNotification);
            eventHandler.emit('sendMail', newArticleMailConfig);
          }

          if (follower.getInAppNotification) {
            Util.sendInAppNotification(
              [follower],
              `${userName} just published a new article`
            );
          }
        });
      }

      article = article.toJSON();
      article.tags = articleData.tagsList;
      const { createdAt, updatedAt } = article;
      await TagHelper.findOrAddTag(article.id, tagsArray);
      article.createdAt = Util.formatDate(createdAt);
      article.updatedAt = Util.formatDate(updatedAt);

      return response(
        res,
        201,
        'success',
        'New article has been successfully created',
        null,
        article
      );
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
   * @description this handles fetching of all available/published articles
   * @param {object} req HTTP request object
   * @param {object} res HTTP response object
   * @returns {object} api route response with the articles
   */
  static async fetchAll(req, res) {
    try {
      const { query } = req;

      const limit = Number(query.limit) || 20;
      const currentPage = Number(query.page) || 1;
      const offset = (currentPage - 1) * limit;

      const totalArticlesPromise = Article.count({
        where: { isPublished: true }
      });

      const articlesPromise = Article.findAndCountAll({
        where: { isPublished: true },
        include: [
          {
            model: User,
            as: 'author',
            attributes: ['userName', 'bio', 'img']
          },
          {
            model: Tag,
            as: 'tags',
            attributes: ['name'],
            through: { attributes: [] }
          }
        ],
        limit,
        offset
      });

      const [totalArticles, articles] = await Promise.all([
        totalArticlesPromise,
        articlesPromise
      ]);

      if (articles.count > 0) {
        const articleList = articles.rows.map(article => {
          article = article.toJSON();
          article.timeToRead = TimeToRead.readTime(article);
          article.tags = article.tags.map(tag => tag.name);
          return article;
        });

        const paginatedData = pagination(
          articleList.length,
          limit,
          currentPage,
          totalArticles
        );

        return response(res, 200, 'success', 'All articles', null, {
          articles: articleList,
          paginatedData
        });
      }

      return response(res, 200, 'success', 'All articles', null, {
        message: 'No articles posted yet'
      });
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
   * @description this handles fetching of a particular article
   * @param {object} req HTTP request object
   * @param {object} res HTTP response object
   * @returns {object} api route response with the article
   */
  static async fetchOne(req, res) {
    try {
      const { slug } = req.params;
      const { authorization } = req.headers;
      const userId = req.user !== undefined ? req.user.userId : null;

      let article = await Article.findOne({
        where: {
          slug,
          [Op.or]: [{ isPublished: true }, { userId }]
        },
        include: [
          {
            model: User,
            as: 'author',
            attributes: ['userName', 'bio', 'img', 'fullName']
          },
          {
            model: Tag,
            as: 'tags',
            attributes: ['name']
          },
          {
            model: Comment,
            as: 'comments',
            attributes: ['id', 'content', 'createdAt'],
            include: [
              {
                model: User,
                attributes: ['userName', 'img', 'fullName']
              },
              {
                model: Highlight,
                as: 'highlight'
              }
            ]
          }
        ]
      });

      if (!article) {
        return response(res, 404, 'failure', 'not found error', {
          message: 'Article not found'
        });
      }

      if (authorization) {
        const token = authorization.split(' ')[1];
        const decoded = TokenManager.verify(token);
        req.user = decoded;
        await createReadingStats(req, res);
      }

      article = article.toJSON();
      const tags = article.tags.map(tag => tag.name);
      article.tags = tags;
      article.timeToRead = TimeToRead.readTime(article);
      article.comments = article.comments.map(comment => {
        if (comment.highlight) {
          comment.highlight = comment.highlight.highlightedText;
        }
        return comment;
      });

      article.createdAt = Util.formatDate(article.createdAt);
      article.updatedAt = Util.formatDate(article.updatedAt);

      return response(
        res,
        200,
        'success',
        'Article was fetched successfully',
        null,
        article
      );
    } catch (error) {
      return response(res, 500, 'failure', 'server error', {
        message: 'Something went wrong on the server'
      });
    }
  }

  /**
   * @static
   * @description this handles the updating of an article
   * @param {object} req HTTP request object
   * @param {object} res HTTP response object
   * @returns {object} api route response with the new article info
   */
  static async update(req, res) {
    try {
      const { userId } = req.user;
      const { slug } = req.params;

      const result = await Article.findOne({
        where: {
          slug,
          userId
        }
      });

      if (result) {
        const articleSlug =
          result.title.toLowerCase() === req.body.title.toLowerCase()
            ? result.slug
            : ArticleHelper.generateArticleSlug(req.body.title);

        req.body.slug = articleSlug;
        let article = await result.update(req.body);
        article = article.toJSON();
        article.timeToRead = TimeToRead.readTime(article);
        article.createdAt = Util.formatDate(article.createdAt);
        article.updatedAt = Util.formatDate(article.updatedAt);
        return response(
          res,
          200,
          'success',
          'Article was updated successfully',
          null,
          article
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
   * @static
   * @description this handles deletion of an article
   * @param {object} req HTTP request object
   * @param {object} res HTTP response object
   * @returns {object} api route response
   */
  static async remove(req, res) {
    try {
      const { userId } = req.user;
      const { slug } = req.params;
      const article = await Article.findOne({
        where: {
          slug,
          userId
        }
      });
      if (article) {
        await article.destroy();
        return response(
          res,
          200,
          'success',
          'Article was deleted successfully',
          null,
          null
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
   * @static
   * @description this handles searching an article by author
   * @param {object} req HTTP request object
   * @param {object} res HTTP response object
   * @returns {object} api route response
   */
  static async search(req, res) {
    const { keyword } = req.query;
    if (keyword) {
      SearchController.keyword(keyword, req, res);
    } else {
      return response(
        res,
        400,
        'failure',
        'No search parameters supplied',
        null,
        null
      );
    }
  }

  /**
   * @static
   * @description this handles the sharing of articles on social media
   * @param {object} req HTTP request object
   * @param {object} res HTTP response object
   * @returns {object} api route response
   */
  static async share(req, res) {
    const { slug } = req.params;
    const { platform } = req.query;
    let article = await Article.findOne({ where: { slug, isPublished: true } });

    if (!article) {
      return response(
        res,
        404,
        'failure',
        'not found error',
        { message: 'Article not found' },
        null
      );
    }

    article = article.toJSON();
    const url = `https://authors-haven-app-21.herokuapp.com/articles/${slug}`;
    const postContent = {
      platform,
      title: article.title,
      body: article.content,
      imageUrl: article.banner,
      url
    };

    const socialShareLink = ArticleHelper.generateSocialShareLink(postContent);
    if (socialShareLink === '') {
      return response(
        res,
        400,
        'failure',
        'bad request error',
        { message: 'Invalid social media platform supplied' },
        null
      );
    }
    return res.redirect(socialShareLink);
  }

  /**
   * @static
   * @description this handles fetching of a particular articles for a user
   * @param {object} req HTTP request object
   * @param {object} res HTTP response object
   * @returns {object} api route response with the articles
   */
  static async fetchAllUserArticles(req, res) {
    try {
      const { userId } = req.user;
      const { tag, drafts, published, page } = req.query;

      const limit = Number(req.query.limit) || 20;
      const currentPage = Number(page) || 1;
      const offset = (currentPage - 1) * limit;

      const articlesCount = await Article.findAndCountAll({
        where: { userId },
        include: [
          {
            model: User,
            as: 'author',
            attributes: ['userName', 'bio', 'img']
          }
        ]
      });
      const totalArticles = articlesCount.count;

      const articles = await Article.findAndCountAll({
        where: { userId },
        include: [
          {
            model: User,
            as: 'author',
            attributes: ['userName', 'bio', 'img']
          },
          {
            model: Tag,
            as: 'tags',
            attributes: ['name'],
            through: { attributes: [] }
          }
        ],
        limit,
        offset
      });

      if (articles.count > 0) {
        let articleList = articles.rows.map(article => {
          article = article.toJSON();
          article.timeToRead = TimeToRead.readTime(article);
          article.tags = article.tags.map(articleTag => articleTag.name);
          return article;
        });

        if (tag) {
          articleList = ArticleHelper.filterAuthorArticle(
            articleList,
            'tag',
            tag
          );
        } else if (drafts === '') {
          articleList = ArticleHelper.filterAuthorArticle(
            articleList,
            'drafts'
          );
        } else if (published === '') {
          articleList = ArticleHelper.filterAuthorArticle(
            articleList,
            'published'
          );
        }

        const paginatedData = pagination(
          articleList.length,
          limit,
          currentPage,
          totalArticles
        );
        const data = {
          articles: articleList,
          paginatedData
        };

        return response(res, 200, 'success', 'All User articles', null, data);
      }
      return response(res, 200, 'success', 'All User articles', null, {
        message: 'No articles posted yet'
      });
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

export default ArticleController;
