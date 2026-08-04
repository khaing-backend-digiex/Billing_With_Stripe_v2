import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma, PlanType } from '../../generated/prisma/client';
import { ExchangeRateService } from '@/catalog/exchange-rate.service';
import { PaymentService } from '@/billing/payment.service';
import { CreateProductDto } from '@/catalog/dto/create-product.dto';
import { UpdateProductDto } from '@/catalog/dto/update-product.dto';
import { ErrorCode } from '@/common/enums/error-code.enum';
import { ServiceError } from '@/common/exceptions/service-error.exception';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  async createProduct(dto: CreateProductDto) {
    this.logger.log(`Creating product: ${dto.name}`);

    const stripeProduct = await this.paymentService.createProduct(dto.name, {
      planType: dto.planType,
    });

    const product = await this.prisma.stripeProduct.create({
      data: {
        stripeProductId: stripeProduct.id,
        name: dto.name,
        planType: dto.planType,
      },
    });

    const currencies = ['VND', 'USD', 'EUR', 'GBP'];
    const prices = [];

    for (const currency of currencies) {
      let amount = dto.basePrice;
      
      if (currency !== 'VND') {
        const rate = await this.exchangeRateService.getExchangeRate(currency);
        amount = Math.round(dto.basePrice * rate);
      }

      const stripePrice = await this.paymentService.createPrice(
        stripeProduct.id,
        amount,
        currency,
        dto.interval,
      );

      const price = await this.prisma.stripePrice.create({
        data: {
          stripePriceId: stripePrice.id,
          productId: product.id,
          currency,
          amount,
          interval: dto.interval || null,
        },
      });

      prices.push(price);
    }

    return {
      ...product,
      prices,
    };
  }

  async findAllProducts(query: { page?: number; limit?: number; planType?: PlanType; isActive?: boolean }) {
    const { page = 1, limit = 20, planType, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.StripeProductWhereInput = {};
    if (planType) where.planType = planType;
    if (isActive !== undefined) where.isActive = isActive;

    const [data, total] = await Promise.all([
      this.prisma.stripeProduct.findMany({
        where,
        include: {
          prices: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.stripeProduct.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findProductById(id: string) {
    const product = await this.prisma.stripeProduct.findUnique({
      where: { id },
      include: {
        prices: true,
      },
    });

    if (!product) {
      throw new ServiceError(ErrorCode.PRODUCT_NOT_FOUND, `Product ${id} not found`);
    }

    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    const product = await this.findProductById(id);

    if (dto.name || dto.isActive !== undefined) {
      await this.paymentService.updateProduct(product.stripeProductId, {
        name: dto.name,
        active: dto.isActive,
      });
    }

    return this.prisma.stripeProduct.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        prices: true,
      },
    });
  }

  async refreshPrices(id: string) {
    const product = await this.findProductById(id);

    await this.prisma.stripePrice.updateMany({
      where: { productId: id },
      data: { isActive: false },
    });

    const currencies = ['VND', 'USD', 'EUR', 'GBP'];
    const newPrices = [];

    for (const currency of currencies) {
      const vndPrice = product.prices.find((p) => p.currency === 'VND');
      if (!vndPrice) continue;

      let amount = vndPrice.amount;
      
      if (currency !== 'VND') {
        const rate = await this.exchangeRateService.getExchangeRate(currency);
        amount = Math.round(vndPrice.amount * rate);
      }

      const stripePrice = await this.paymentService.createPrice(
        product.stripeProductId,
        amount,
        currency,
        vndPrice.interval as 'month' | 'year' | undefined,
      );

      const price = await this.prisma.stripePrice.create({
        data: {
          stripePriceId: stripePrice.id,
          productId: id,
          currency,
          amount,
          interval: product.prices[0]?.interval || null,
        },
      });

      newPrices.push(price);
    }

    return {
      ...product,
      prices: newPrices,
    };
  }

  async getExchangeRates() {
    return this.exchangeRateService.getCachedRates();
  }
}
