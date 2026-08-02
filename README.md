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

## Mô tả (Description)

**Billing Stripe Prompt** là một hệ thống backend được xây dựng bằng **NestJS** kết hợp với **Prisma ORM**, **PostgreSQL** và tích hợp thanh toán qua **Stripe**. Ứng dụng cung cấp các tính năng quản lý sản phẩm (catalog), thanh toán (billing), xử lý webhook từ Stripe, quản lý tín dụng (credit) và xác thực (auth).

## Công nghệ sử dụng

- **Framework**: [NestJS](https://nestjs.com/) v11
- **Cơ sở dữ liệu**: PostgreSQL
- **ORM**: [Prisma](https://www.prisma.io/) v7
- **Thanh toán**: [Stripe SDK](https://stripe.com/docs/api)
- **Bảo mật**: JWT (JSON Web Token), Bcrypt
- **Ngôn ngữ**: TypeScript

## Cấu trúc thư mục chính

```
src/
├── auth/          # Quản lý xác thực và phân quyền (Login, Register, JWT)
├── billing/       # Xử lý thanh toán, Stripe webhook, hoá đơn, chiến lược xử lý
├── catalog/       # Quản lý danh mục sản phẩm, các gói dịch vụ
├── credit/        # Quản lý số dư, tín dụng của người dùng
├── constants/     # Chứa các hằng số dùng chung cho toàn dự án
├── prisma/        # Dịch vụ kết nối Prisma Database
├── app.module.ts  # Module gốc (Root Module) của ứng dụng
└── main.ts        # Entry point khởi chạy server NestJS
```

## Yêu cầu hệ thống

Trước khi cài đặt, đảm bảo máy tính của bạn đã cài đặt:
- **Node.js** (Khuyến nghị phiên bản v18 hoặc v20 trở lên)
- **PostgreSQL** (Đang chạy local hoặc trên cloud)
- **Stripe CLI** (Tùy chọn - dùng để test Webhook trên môi trường local)

## Cài đặt (Project setup)

```bash
# Clone dự án về máy
$ git clone <đường-dẫn-repo>
$ cd Billing_Stripe_Prompt

# Cài đặt các thư viện phụ thuộc
$ npm install
```

### Thiết lập Biến môi trường (.env)

Tạo file `.env` ở thư mục gốc của dự án bằng cách copy từ `.env.example`:

```bash
$ cp .env.example .env
```

Cập nhật các thông tin cấu hình phù hợp với môi trường của bạn:

```env
# Stripe Configuration (Lấy từ Dashboard của Stripe)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Database PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/billing_db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1h

# Frontend URL (Dùng cho điều hướng thanh toán Stripe Checkout)
FRONTEND_URL=http://localhost:3000
```

### Thiết lập Cơ sở dữ liệu (Prisma)

```bash
# Chạy migration để tạo các bảng trong database
$ npx prisma migrate dev

# Generate Prisma client
$ npx prisma generate
```

### Test Stripe Webhook Local (Tùy chọn)

```bash
$ stripe listen --forward-to localhost:3000/billing/webhook
```
*(Copy webhook secret `whsec_...` vào biến `STRIPE_WEBHOOK_SECRET`)*

## Chạy ứng dụng (Compile and run the project)

```bash
# development mode
$ npm run start

# watch mode
$ npm run start:dev

# production mode (sau khi đã build)
$ npm run start:prod
```

## Kiểm thử (Run tests)

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Triển khai (Deployment)

Khi bạn đã sẵn sàng triển khai ứng dụng NestJS của mình lên production, có một số bước quan trọng bạn có thể thực hiện để đảm bảo nó chạy hiệu quả nhất. Hãy xem qua [tài liệu triển khai](https://docs.nestjs.com/deployment) để biết thêm thông tin.

Nếu bạn đang tìm kiếm một nền tảng dựa trên đám mây để triển khai ứng dụng NestJS của mình, hãy xem qua [Mau](https://mau.nestjs.com), nền tảng chính thức của chúng tôi để triển khai các ứng dụng NestJS trên AWS. Mau giúp việc triển khai trở nên đơn giản và nhanh chóng chỉ với vài bước:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

Với Mau, bạn có thể triển khai ứng dụng của mình chỉ bằng vài cú nhấp chuột, cho phép bạn tập trung vào việc xây dựng tính năng thay vì quản lý cơ sở hạ tầng.

## Tài nguyên (Resources)

Một số tài nguyên hữu ích khi làm việc với NestJS:

- Tham quan [Tài liệu NestJS](https://docs.nestjs.com) để tìm hiểu thêm về framework.
- Đối với các câu hỏi và hỗ trợ, vui lòng truy cập [Kênh Discord](https://discord.gg/G7Qnnhy).
- Để tìm hiểu sâu hơn và có thêm kinh nghiệm thực tế, hãy xem [các khóa học](https://courses.nestjs.com/) video chính thức.
- Triển khai ứng dụng của bạn lên AWS với sự trợ giúp của [NestJS Mau](https://mau.nestjs.com).
- Trực quan hóa đồ thị ứng dụng của bạn và tương tác với ứng dụng NestJS trong thời gian thực bằng [NestJS Devtools](https://devtools.nestjs.com).

## Hỗ trợ (Support)

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Liên hệ (Stay in touch)

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## Giấy phép (License)

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
