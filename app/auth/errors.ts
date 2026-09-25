// Match on error.code, not the message: GoTrue rewords its English strings between releases.
const ERROR_BY_CODE: Record<string, string> = {
  invalid_credentials: "Неверный email или пароль",
  email_not_confirmed: "Email не подтверждён. Проверьте почту и перейдите по ссылке в письме.",
  user_already_exists: "Пользователь с таким email уже зарегистрирован",
  email_exists: "Пользователь с таким email уже зарегистрирован",
  email_address_invalid: "Некорректный email",
  weak_password: "Слишком простой пароль — добавьте символов или цифр",
  over_email_send_rate_limit: "Слишком много писем за короткое время. Подождите минуту и попробуйте снова.",
  over_request_rate_limit: "Слишком много попыток. Подождите немного и попробуйте снова.",
  signup_disabled: "Регистрация временно недоступна",
  email_provider_disabled: "Вход по email временно недоступен",
  user_banned: "Аккаунт заблокирован. Свяжитесь с нами.",
  otp_expired: "Ссылка устарела. Запросите письмо заново.",
  validation_failed: "Проверьте правильность заполнения полей",
};

const ERROR_BY_MESSAGE: Record<string, string> = {
  "Invalid login credentials": "Неверный email или пароль",
  "Email not confirmed": "Email не подтверждён. Проверьте почту и перейдите по ссылке в письме.",
  "User already registered": "Пользователь с таким email уже зарегистрирован",
};

export const NETWORK_ERROR = "Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.";

export function translateError(error: { message: string; code?: string }): string {
  if (error.code && ERROR_BY_CODE[error.code]) return ERROR_BY_CODE[error.code];
  return ERROR_BY_MESSAGE[error.message] ?? error.message;
}
