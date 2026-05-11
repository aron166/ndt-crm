import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContactsRepository } from './contacts.repository';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ContactWithRelations } from './entities/contact.entity';

@Injectable()
export class ContactsService {
  constructor(private readonly contactsRepository: ContactsRepository) {}

  async getById(tenantId: number, id: number): Promise<{ data: ContactWithRelations }> {
    const contact = await this.contactsRepository.findById(tenantId, id);
    if (!contact) throw new NotFoundException(`Contact ${id} not found`);
    return { data: contact };
  }

  async listByCompany(
    tenantId: number,
    companyId: number,
  ): Promise<{ data: ContactWithRelations[] }> {
    const data = await this.contactsRepository.findActiveByCompany(tenantId, companyId);
    return { data };
  }

  async historyByPerson(
    tenantId: number,
    personId: number,
  ): Promise<{ data: ContactWithRelations[] }> {
    const data = await this.contactsRepository.findAllByPerson(tenantId, personId);
    return { data };
  }

  async create(
    tenantId: number,
    dto: CreateContactDto,
  ): Promise<{ data: ContactWithRelations }> {
    const contact = await this.contactsRepository.create(tenantId, {
      tenantId,
      personId: dto.personId,
      companyId: dto.companyId,
      role: dto.role,
      email: dto.email,
      phone: dto.phone,
      isPrimary: dto.isPrimary ?? false,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
    });
    return { data: contact };
  }

  async update(
    tenantId: number,
    id: number,
    dto: UpdateContactDto,
  ): Promise<{ data: ContactWithRelations }> {
    await this.getById(tenantId, id);
    const contact = await this.contactsRepository.update(tenantId, id, dto);
    return { data: contact };
  }

  async close(tenantId: number, id: number): Promise<{ data: ContactWithRelations }> {
    const { data: contact } = await this.getById(tenantId, id);

    if (contact.endedAt !== null) {
      throw new BadRequestException('Contact is already closed');
    }

    const closed = await this.contactsRepository.close(tenantId, id);
    return { data: closed };
  }
}
