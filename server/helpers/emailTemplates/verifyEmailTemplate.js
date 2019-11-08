const verifyEmailTemplate = (createdUser, token) => `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="X-UA-Compatible" content="ie=edge" />
      <link href="https://fonts.googleapis.com/css?family=Hind:400,500" rel="stylesheet">
      <style>
        * {font-family: 'Hind';}
        .container {width: 80%;margin: 0 auto;background: #fbfbfb;padding: 30px;}
        .username {font-size: 1.2rem;}
        .message{font-size: 1.2rem;}
        .reset-btn {display: inline-block;background: #2fb5ee;padding: 10px; color: #fff !important;text-decoration: none;font-size: 1rem;}
        .logo {width: 165px; padding-bottom: 20px; border-bottom: 1px solid #2fb5ee;}
      </style>
    </head>
    <body>
      <div class="container">
        <img class="logo"
          src="https://res.cloudinary.com/jesseinit/image/upload/v1547303525/Logo.png"
          alt="logo"
        />
        <h3 class="username"">Hi ${createdUser.fullName},</h3>
        <p class="message">
         You have tried to register on Author's Haven.</br>
         Please verify your email address by clicking the link below.
         <br>
         Please note that this link expires in 24 hours.
        </p>
        <a class="reset-btn" href="https://authors-haven-app-21.herokuapp.com/auth/verify/${token}">
          Verify your email
        </a>
      </div>
    </body>
  </html>`;

export default verifyEmailTemplate;
