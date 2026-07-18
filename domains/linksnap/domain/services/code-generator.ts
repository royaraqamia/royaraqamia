export class CodeGenerator {
  private static readonly CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  private static readonly DEFAULT_LENGTH = 6;

  static generate(length = CodeGenerator.DEFAULT_LENGTH): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += CodeGenerator.CHARS.charAt(Math.floor(Math.random() * CodeGenerator.CHARS.length));
    }
    return result;
  }

  static sanitizeCustomCode(code: string): string {
    return code.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  }
}
