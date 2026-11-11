import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { OrderStatus } from './order.schema';

export class MeasurementDto {
  @IsString() label!: string;
  @IsString() value!: string;
  @IsOptional() @IsString() unit?: string;
}
export class CreateOrderDto {
  @IsMongoId() clientId!: string;
  @IsString() garmentType!: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() deliveryDate!: string;
  @IsOptional() @IsDateString() givenDate?: string;
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MeasurementDto) measurements?: MeasurementDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) referenceLinks?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsString({ each: true }) @MaxLength(1500000, { each: true }) imageUrls?: string[];
  @IsOptional() @IsString() @MaxLength(1500000) sketchUrl?: string;
  @IsOptional() @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateOrderDto {
  @IsOptional() @IsString() garmentType?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() deliveryDate?: string;
  @IsOptional() @IsDateString() givenDate?: string;
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MeasurementDto) measurements?: MeasurementDto[];
  @IsOptional() @IsArray() @IsString({ each: true }) referenceLinks?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsString({ each: true }) @MaxLength(1500000, { each: true }) imageUrls?: string[];
  @IsOptional() @IsString() @MaxLength(1500000) sketchUrl?: string | null;
  @IsOptional() @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional() @IsString() notes?: string;
}
