import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserPayload } from '../../common/strategies/jwt.strategy';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  // ── Single contact ──────────────────────────────────────────────────────────

  @Get('contacts/:id')
  getById(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contactsService.getById(user.tenantId, id);
  }

  @Post('contacts')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateContactDto) {
    return this.contactsService.create(user.tenantId, dto);
  }

  @Patch('contacts/:id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(user.tenantId, id, dto);
  }

  @Post('contacts/:id/close')
  close(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contactsService.close(user.tenantId, id);
  }

  // ── Nested routes ───────────────────────────────────────────────────────────

  /** Active contacts at a company */
  @Get('companies/:companyId/contacts')
  listByCompany(
    @CurrentUser() user: CurrentUserPayload,
    @Param('companyId', ParseIntPipe) companyId: number,
  ) {
    return this.contactsService.listByCompany(user.tenantId, companyId);
  }

  /** Full employment history for a person */
  @Get('persons/:personId/contacts')
  historyByPerson(
    @CurrentUser() user: CurrentUserPayload,
    @Param('personId', ParseIntPipe) personId: number,
  ) {
    return this.contactsService.historyByPerson(user.tenantId, personId);
  }
}
