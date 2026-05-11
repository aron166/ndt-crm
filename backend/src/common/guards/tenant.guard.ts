import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUserPayload } from '../strategies/jwt.strategy';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as CurrentUserPayload;
    const tenantId = Number(request.params['tenantId']);

    if (!tenantId) {
      return true; // route doesn't have a :tenantId param — guard is a no-op
    }

    if (user.tenantId !== tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    return true;
  }
}
