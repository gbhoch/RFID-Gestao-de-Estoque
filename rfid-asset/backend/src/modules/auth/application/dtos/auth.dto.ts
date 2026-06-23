import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString() @IsNotEmpty() login: string;

  @ApiProperty({ example: 'Admin@123' })
  @IsString() @IsNotEmpty() password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString() @IsNotEmpty() refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString() @IsNotEmpty() currentPassword: string;

  @ApiProperty()
  @IsString() @MinLength(8) newPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsString() @IsNotEmpty() email: string;
}

export interface JwtPayload {
  sub: string;
  login: string;
  role: string;
  permissions: string[];
}
