
import {
  IsEmail,
  IsString,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email: string;

  @IsString()
  @Matches(/^0\d{9}$/, {
    message: 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0',
  })
  phone: string;

  @IsString()
  @MinLength(8, {
    message: 'Mật khẩu phải có ít nhất 8 ký tự',
  })
  @MaxLength(72, {
    message: 'Mật khẩu không được vượt quá 72 ký tự',
  })
  password: string;
}
