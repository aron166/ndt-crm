import { Body, Controller, Post } from '@nestjs/common';
import { AuthService, AuthToken } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthToken> {
    return this.authService.login(dto);
  }
}
