# Billing Stripe Prompt

Dự án này là một hệ thống backend được xây dựng bằng **NestJS** kết hợp với **Prisma ORM**, **PostgreSQL** và tích hợp thanh toán qua **Stripe**. Ứng dụng cung cấp các tính năng quản lý sản phẩm (catalog), thanh toán (billing), xử lý webhook từ Stripe, quản lý tín dụng (credit) và xác thực (auth).

## 🚀 Công nghệ sử dụng

- **Framework**: [NestJS](https://nestjs.com/) v11
- **Cơ sở dữ liệu**: PostgreSQL
- **ORM**: [Prisma](https://www.prisma.io/) v7
- **Thanh toán**: [Stripe SDK](https://stripe.com/docs/api)
- **Bảo mật**: JWT (JSON Web Token), Bcrypt
- **Ngôn ngữ**: TypeScript

## 📁 Cấu trúc thư mục chính

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

## ⚙️ Yêu cầu hệ thống

Trước khi cài đặt, đảm bảo máy tính của bạn đã cài đặt:
- **Node.js** (Khuyến nghị phiên bản v18 hoặc v20 trở lên)
- **PostgreSQL** (Đang chạy local hoặc trên cloud)
- **Stripe CLI** (Tùy chọn - dùng để test Webhook trên môi trường local)

## 🛠 Hướng dẫn Cài đặt & Thiết lập

Thực hiện các bước sau để cấu hình và chạy dự án trên môi trường phát triển (Local):

### Bước 1: Clone dự án và cài đặt thư viện

```bash
# Clone dự án về máy
git clone <đường-dẫn-repo>
cd Billing_Stripe_Prompt

# Cài đặt các thư viện phụ thuộc
npm install
```

### Bước 2: Thiết lập Biến môi trường (.env)

Tạo file `.env` ở thư mục gốc của dự án bằng cách copy từ `.env.example`:

```bash
cp .env.example .env
```

Sau đó, mở file `.env` và cập nhật các thông tin cấu hình phù hợp với môi trường của bạn:

```env
# Stripe Configuration (Lấy từ Dashboard của Stripe)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Database PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/billing_db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1h

# Tỷ giá (Nếu dùng API tỷ giá)
EXCHANGE_RATE_API_KEY=your_exchange_rate_api_key_here
SUPPORTED_CURRENCIES=VND,USD,EUR,GBP

# Frontend URL (Dùng cho điều hướng thanh toán Stripe Checkout)
FRONTEND_URL=http://localhost:3000
```

### Bước 3: Thiết lập Cơ sở dữ liệu (Prisma)

Sau khi đã điền đúng `DATABASE_URL`, tiến hành đồng bộ schema vào database và sinh ra Prisma Client:

```bash
# Chạy migration để tạo các bảng trong database (Nếu đã có file trong thư mục prisma/migrations)
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

*(Lưu ý: Nếu bạn có DB mới tinh và chưa có file migration nào, hãy dùng lệnh `npx prisma db push` để đẩy schema lên DB trước)*

### Bước 4: Test Stripe Webhook Local (Tùy chọn nhưng cần thiết)

Để nhận webhook từ Stripe về máy local trong quá trình dev, bạn sử dụng Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/billing/webhook
```
*(Stripe CLI sẽ in ra webhook secret dạng `whsec_...`, hãy copy và dán vào biến `STRIPE_WEBHOOK_SECRET` trong file `.env` của bạn)*

## 🚦 Chạy ứng dụng

Sau khi cài đặt xong, bạn có thể khởi chạy server NestJS bằng các lệnh sau:

```bash
# Môi trường phát triển (tự động reload khi có thay đổi code)
npm run start:dev

# Chạy thông thường
npm run start

# Build dự án ra thư mục dist và chạy production
npm run build
node dist/main.js
```

Ứng dụng mặc định sẽ chạy ở cổng `3000` (hoặc cấu hình trong source code).

## 🧪 Chạy Test (Kiểm thử)

Dự án sử dụng Jest làm test runner. Bạn có thể chạy kiểm thử bằng các lệnh:

```bash
# Chạy tất cả các unit test
npm run test

# Chạy test và watch (tự động chạy lại khi sửa code)
npm run test:watch

# Chạy test và xem báo cáo độ phủ (Coverage report)
npm run test:cov
```

---
*Tài liệu README này cung cấp cái nhìn tổng quan nhất về quy trình thiết lập dự án. Hãy kiểm tra các file bên trong thư mục `src/` để hiểu rõ chi tiết logic nghiệp vụ của từng module.*
