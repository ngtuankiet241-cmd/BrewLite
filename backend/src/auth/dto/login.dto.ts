
import { IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Matches(/^0\d{9}$/, {
    message: 'Số điện thoại không hợp lệ',
  })
  phone: string;

  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu' })
  @MaxLength(72, {
    message: 'Mật khẩu không hợp lệ',
  })
  password: string;
}
