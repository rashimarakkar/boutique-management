import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from './dto';
import { ExpenseCategory, ExpenseCategoryDocument } from './expense-category.schema';
import { Expense, ExpenseDocument } from './expense.schema';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectModel(Expense.name) private readonly expenses: Model<ExpenseDocument>,
    @InjectModel(ExpenseCategory.name)
    private readonly categories: Model<ExpenseCategoryDocument>,
  ) {}

  async findCategories() {
    const existingNames = await this.expenses.distinct('category').exec();
    for (const rawName of existingNames) {
      const name = rawName.trim();
      if (!name) continue;
      const normalizedName = this.normalizeCategory(name);
      let category: ExpenseCategoryDocument | null;
      try {
        category = await this.categories.findOneAndUpdate(
          { normalizedName },
          { $setOnInsert: { name, normalizedName } },
          { upsert: true, new: true },
        ).exec();
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) throw error;
        category = await this.categories.findOne({ normalizedName }).exec();
      }
      if (category && name !== category.name) {
        await this.expenses.updateMany(
          { category: this.categoryMatch(name) },
          { $set: { category: category.name } },
        ).exec();
      }
    }
    return this.categories.find().sort({ name: 1 }).lean();
  }

  async createCategory(dto: CreateExpenseCategoryDto) {
    const name = dto.name.trim();
    const normalizedName = this.normalizeCategory(name);
    try {
      return await this.categories.create({ name, normalizedName });
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('An expense category with this name already exists');
      }
      throw error;
    }
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto) {
    const categoryId = this.toObjectId(id, 'category');
    const name = dto.name.trim();
    const normalizedName = this.normalizeCategory(name);
    const category = await this.categories.findById(categoryId).exec();
    if (!category) throw new NotFoundException('Expense category not found');
    const duplicate = await this.categories.findOne({
      normalizedName,
      _id: { $ne: categoryId },
    }).exec();
    if (duplicate) {
      throw new ConflictException('An expense category with this name already exists');
    }

    const previousName = category.name;
    if (previousName !== name) {
      await this.expenses.updateMany(
        { category: this.categoryMatch(previousName) },
        { $set: { category: name } },
      ).exec();
    }
    try {
      category.name = name;
      category.normalizedName = normalizedName;
      await category.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        if (previousName !== name) {
          await this.expenses.updateMany(
            { category: this.categoryMatch(name) },
            { $set: { category: previousName } },
          ).exec();
        }
        throw new ConflictException('An expense category with this name already exists');
      }
      if (previousName !== name) {
        try {
          await this.expenses.updateMany(
            { category: this.categoryMatch(name) },
            { $set: { category: previousName } },
          ).exec();
        } catch (rollbackError) {
          throw new ConflictException(
            `Category rename failed and expense records could not be restored: ${
              rollbackError instanceof Error ? rollbackError.message : 'unknown rollback error'
            }`,
          );
        }
      }
      throw error;
    }
    return category;
  }

  async removeCategory(id: string) {
    const categoryId = this.toObjectId(id, 'category');
    const category = await this.categories.findById(categoryId).lean();
    if (!category) throw new NotFoundException('Expense category not found');
    const inUse = await this.expenses.exists({
      category: this.categoryMatch(category.name),
    });
    if (inUse) {
      throw new ConflictException('This category is used by expenses and cannot be deleted');
    }
    await this.categories.findByIdAndDelete(categoryId).exec();
    return { deleted: true };
  }

  async findAll(query: ListExpensesQueryDto) {
    const { category, startDate, endDate, skip = 0, limit = 20 } = query;
    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('End date must be on or after start date');
    }

    const filter: Record<string, unknown> = {};
    if (category?.trim()) filter.category = this.categoryMatch(category.trim());
    if (startDate || endDate) {
      const expenseDate: Record<string, Date> = {};
      if (startDate) expenseDate.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) {
        const endExclusive = new Date(`${endDate}T00:00:00.000Z`);
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
        expenseDate.$lt = endExclusive;
      }
      filter.expenseDate = expenseDate;
    }

    const [data, total, totals] = await Promise.all([
      this.expenses.find(filter).sort({ expenseDate: -1, _id: -1 })
        .skip(skip).limit(limit).lean(),
      this.expenses.countDocuments(filter),
      this.expenses.aggregate([
        { $match: filter },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      data,
      total,
      totalAmount: totals[0]?.amount ?? 0,
      skip,
      limit,
    };
  }

  async create(dto: CreateExpenseDto) {
    const category = await this.findCategoryByName(dto.category);
    return this.expenses.create({
      ...dto,
      category: category.name,
      description: dto.description?.trim(),
      expenseDate: new Date(`${dto.expenseDate}T00:00:00.000Z`),
    });
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const category = dto.category === undefined
      ? undefined
      : await this.findCategoryByName(dto.category);
    const expense = await this.expenses.findByIdAndUpdate(
      this.toObjectId(id),
      {
        ...dto,
        ...(category ? { category: category.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.expenseDate !== undefined
          ? { expenseDate: new Date(`${dto.expenseDate}T00:00:00.000Z`) }
          : {}),
      },
      { new: true, runValidators: true },
    ).lean();
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async remove(id: string) {
    const expense = await this.expenses.findByIdAndDelete(this.toObjectId(id)).lean();
    if (!expense) throw new NotFoundException('Expense not found');
    return { deleted: true };
  }

  private async findCategoryByName(name: string) {
    const category = await this.categories.findOne({
      normalizedName: this.normalizeCategory(name.trim()),
    }).exec();
    if (!category) throw new BadRequestException('Select a valid expense category');
    return category;
  }

  private categoryMatch(name: string) {
    return new RegExp(`^\\s*${name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  }

  private normalizeCategory(name: string) {
    return name.trim().toLocaleLowerCase();
  }

  private isDuplicateKeyError(error: unknown) {
    return typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000;
  }

  private toObjectId(id: string, entity = 'expense') {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`Invalid ${entity} id`);
    return new Types.ObjectId(id);
  }
}
