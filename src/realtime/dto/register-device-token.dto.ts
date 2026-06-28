import { ApiProperty } from '@nestjs/swagger';
import { DevicePlatform } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({ description: 'FCM registration token from the device' })
  @IsString()
  @MinLength(10)
  @MaxLength(4096)
  token!: string;

  @ApiProperty({
    enum: DevicePlatform,
    description: 'Device platform the token belongs to',
  })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}
