import { Module } from '@nestjs/common';
import { OrgsController } from './orgs.controller';
import { InvitesController } from './invites.controller';
import { OrgsService } from './orgs.service';

@Module({
  controllers: [OrgsController, InvitesController],
  providers: [OrgsService],
  exports: [OrgsService],
})
export class OrgsModule {}
