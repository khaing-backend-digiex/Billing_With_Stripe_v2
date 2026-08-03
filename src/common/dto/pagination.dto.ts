import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1, description: 'Current page number' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Items per page' })
  limit!: number;

  @ApiProperty({ example: 150, description: 'Total number of items' })
  total!: number;

  @ApiProperty({ example: 8, description: 'Total number of pages' })
  totalPages!: number;

  @ApiProperty({ example: true, description: 'Whether there is a next page' })
  hasNext!: boolean;

  @ApiProperty({ example: false, description: 'Whether there is a previous page' })
  hasPrev!: boolean;
}
