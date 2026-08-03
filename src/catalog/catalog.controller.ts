import { Controller, Post, Get, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductListQueryDto } from './dto/catalog-query.dto';
import { ProductWithPricesResponseDto, ExchangeRateResponseDto } from './dto/catalog-response.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/enums/permission.enum';

@ApiTags('Catalog')
@Controller('catalog')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.CATALOG_MANAGE)
@ApiBearerAuth()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('products')
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created', type: ProductWithPricesResponseDto })
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }

  @Get('products')
  @ApiOperation({ summary: 'Get all products with pagination' })
  @ApiResponse({ status: 200, description: 'List of products', type: [ProductWithPricesResponseDto] })
  findAllProducts(@Query() query: ProductListQueryDto) {
    return this.catalogService.findAllProducts(query);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product found', type: ProductWithPricesResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findProductById(@Param('id') id: string) {
    return this.catalogService.findProductById(id);
  }

  @Put('products/:id')
  @ApiOperation({ summary: 'Update product' })
  @ApiResponse({ status: 200, description: 'Product updated', type: ProductWithPricesResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalogService.updateProduct(id, dto);
  }

  @Post('products/:id/refresh-prices')
  @ApiOperation({ summary: 'Refresh product prices' })
  @ApiResponse({ status: 200, description: 'Prices refreshed', type: ProductWithPricesResponseDto })
  @ApiResponse({ status: 404, description: 'Product not found' })
  refreshPrices(@Param('id') id: string) {
    return this.catalogService.refreshPrices(id);
  }

  @Get('exchange-rates')
  @ApiOperation({ summary: 'Get exchange rates' })
  @ApiResponse({ status: 200, description: 'Exchange rates', type: [ExchangeRateResponseDto] })
  getExchangeRates() {
    return this.catalogService.getExchangeRates();
  }
}
