import { Module } from '@nestjs/common';
import { InteractionsController } from './interactions.controller';
import { InteractionsRepository } from './interactions.repository';
import { InteractionsService } from './interactions.service';

@Module({
  controllers: [InteractionsController],
  providers: [InteractionsService, InteractionsRepository],
})
export class InteractionsModule {}
