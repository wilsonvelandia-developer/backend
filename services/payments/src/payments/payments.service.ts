import { PaymentsRepository } from './payments.repository.js';
import { CreatePaymentDto, UpdatePaymentDto } from './payments.schema.js';
import { Payment, UpdatePaymentInput } from './payments.types.js';

/**
 * Payments service — business logic layer.
 */
export class PaymentsService {
  constructor(private readonly repo: PaymentsRepository) {}

  async getAll(tournamentId?: string, teamId?: string, status?: string): Promise<Payment[]> {
    return this.repo.findAll(tournamentId, teamId, status);
  }

  async getById(id: string): Promise<Payment> {
    return this.repo.findById(id);
  }

  async create(dto: CreatePaymentDto, recordedBy: string | null): Promise<Payment> {
    return this.repo.create({
      tournamentId:  dto.tournamentId,
      teamId:        dto.teamId,
      amount:        dto.amount,
      currency:      dto.currency,
      paymentMethod: dto.paymentMethod ?? dto.method ?? null,
      reference:     dto.reference,
      notes:         dto.notes,
      status:        dto.status,
      recordedBy,
      paidAt:        dto.paidAt,
    });
  }

  async update(id: string, dto: UpdatePaymentDto): Promise<Payment> {
    const input: Record<string, unknown> = {};
    if (dto.amount !== undefined) input['amount'] = dto.amount;
    if (dto.currency !== undefined) input['currency'] = dto.currency;
    if (dto.paymentMethod !== undefined) input['paymentMethod'] = dto.paymentMethod;
    if (dto.method !== undefined) input['paymentMethod'] = dto.method;
    if (dto.reference !== undefined) input['reference'] = dto.reference;
    if (dto.notes !== undefined) input['notes'] = dto.notes;
    if (dto.status !== undefined) input['status'] = dto.status;
    if (dto.paidAt !== undefined) input['paidAt'] = dto.paidAt;
    return this.repo.update(id, input as UpdatePaymentInput);
  }

  async delete(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}
