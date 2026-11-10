import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from './dto';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get('categories')
  findCategories() {
    return this.expenses.findCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateExpenseCategoryDto) {
    return this.expenses.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.expenses.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@Param('id') id: string) {
    return this.expenses.removeCategory(id);
  }

  @Get()
  findAll(@Query() query: ListExpensesQueryDto) {
    return this.expenses.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto) {
    return this.expenses.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.expenses.remove(id);
  }
}
