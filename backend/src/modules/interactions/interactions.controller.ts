import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUserPayload } from '../../common/strategies/jwt.strategy';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { ListInteractionsDto } from './dto/list-interactions.dto';
import { InteractionsService } from './interactions.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  /** Log a new interaction — the only write operation. No update, no delete. */
  @Post('interactions')
  log(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateInteractionDto) {
    return this.interactionsService.log(user.tenantId, user.userId, dto);
  }

  @Get('companies/:companyId/interactions')
  listByCompany(
    @CurrentUser() user: CurrentUserPayload,
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query() query: ListInteractionsDto,
  ) {
    return this.interactionsService.listByCompany(user.tenantId, companyId, query);
  }

  @Get('persons/:personId/interactions')
  listByPerson(
    @CurrentUser() user: CurrentUserPayload,
    @Param('personId', ParseIntPipe) personId: number,
    @Query() query: ListInteractionsDto,
  ) {
    return this.interactionsService.listByPerson(user.tenantId, personId, query);
  }
}
