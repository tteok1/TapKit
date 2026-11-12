import {
  CanvasReplySchema,
  type CanvasCommand,
  type CanvasSourceSchema,
  type z,
} from '@tapkit/contracts';
import { requestOptions } from '../../src/desktop-state';

export async function canvasCommand(
  command: CanvasCommand,
  payload: unknown,
  options = requestOptions(),
) {
  const reply = await window.tapkit.canvasCommand(options, command, payload);
  if (!reply.ok) throw Error(reply.error.code);
  return CanvasReplySchema.parse(reply.data);
}

export async function openCanvas(source: z.infer<typeof CanvasSourceSchema>) {
  const result = await canvasCommand('canvas.open', { source });
  if (!('canvas' in result)) throw Error('INTERNAL_ERROR');
  return '/canvas/' + result.canvas.documentId;
}

export const canvasErrors: Record<string, string> = {
  AUTH_REQUIRED: '请在设置中连接可用的模型后重试。',
  CONFLICT: '画布版本或选区已变化。请重新生成建议，或从画布列表打开最新版本。',
  INDEX_NOT_READY: '文件正文仍在解析。请等待解析完成后重试。',
  PARSE_FAILED: '无法验证正文或导出文件。请检查源文件和内容后重试。',
  FORMAT_UNSUPPORTED: '此格式或图片不可用于正文画布。',
  NOT_FOUND: '所选画布或资料版本已不可用。',
  OUTPUT_LIMIT_REACHED: '内容超过画布处理上限，请缩小选区或使用较短的资料。',
  SANDBOX_UNAVAILABLE: '当前环境无法进行隔离 PDF 转换。可保存 Word 或 Markdown。',
  SIDE_EFFECT_UNKNOWN: '上一请求的结果未确认。请检查当前画布后重新操作。',
  NETWORK_ERROR: '模型连接失败，请检查连接后重试。',
  DOCUMENT_CONTENT_REQUIRED: '请先添加可导出的正文。',
};

export function canvasError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  return canvasErrors[code] ?? '操作未完成，请检查内容后重试。';
}
