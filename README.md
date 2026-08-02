<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>

## Description

**Billing Stripe Prompt** is a backend application built with the **NestJS** framework, combined with **Prisma ORM**, **PostgreSQL**, and integrated with **Stripe** for payments. The application provides features for catalog management, billing, Stripe webhook processing, user credit management, and authentication.

## Technologies Used

- **Framework**: [NestJS](https://nestjs.com/) v11
- **Database**: PostgreSQL
- **ORM**: [Prisma](https://www.prisma.io/) v7
- **Payments**: [Stripe SDK](https://stripe.com/docs/api)
- **Security**: JWT (JSON Web Token), Bcrypt
- **Language**: TypeScript

## Project Structure

```
src/
├── auth/          # Authentication and authorization (Login, Register, JWT)
├── billing/       # Payment processing, Stripe webhooks, invoicing, strategies
├── catalog/       # Product catalog and subscription plans management
├── credit/        # User credit balances management
├── constants/     # Shared constants across the project
├── prisma/        # Prisma database service connection
├── app.module.ts  # Root module of the application
└── main.ts        # Entry point for the NestJS server
```

## Prerequisites

Before starting, ensure you have the following installed:
- **Node.js** (v18 or v20+ recommended)
- **PostgreSQL** (Running locally or in the cloud)
- **Stripe CLI** (Optional - used for testing webhooks locally)

## Project setup

```bash
# Clone the repository
$ git clone <repository-url>
$ cd Billing_Stripe_Prompt

# Install dependencies
$ npm install
```

### Environment Variables (.env)

Create a `.env` file in the root directory by copying the `.env.example` file:

```bash
$ cp .env.example .env
```

Update the configuration information in your `.env` file according to your environment:

```env
# Stripe Configuration (From your Stripe Dashboard)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# PostgreSQL Database Connection
DATABASE_URL=postgresql://user:password@localhost:5432/billing_db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1h

# Frontend URL (Used for Stripe Checkout redirects)
FRONTEND_URL=http://localhost:3000
```

### Database Setup (Prisma)

```bash
# Run migrations to create database tables
$ npx prisma migrate dev

# Generate Prisma client
$ npx prisma generate
```

### Test Stripe Webhook Local (Optional)

```bash
$ stripe listen --forward-to localhost:3000/billing/webhook
```
*(Copy the webhook secret `whsec_...` and paste it into your `STRIPE_WEBHOOK_SECRET` variable in the `.env` file)*

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
