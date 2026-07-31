import { Controller, Post, Get, Put, Param, Body, UseGuards } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('admin/catalog')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions('CATALOG_MANAGE')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }

  @Get('products')
  findAllProducts() {
    return this.catalogService.findAllProducts();
  }

  @Get('products/:id')
  findProductById(@Param('id') id: string) {
    return this.catalogService.findProductById(id);
  }

  @Put('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.catalogService.updateProduct(id, dto);
  }

  @Post('products/:id/refresh-prices')
  refreshPrices(@Param('id') id: string) {
    return this.catalogService.refreshPrices(id);
  }

  @Get('exchange-rates')
  getExchangeRates() {
    return this.catalogService.getExchangeRates();
  }
}
