import { ActionPopover, IconButton } from './action-popover';
import { UiIcon } from './ui-icon';

export function ComposerAttachment({
  name,
  status,
  size,
  working = false,
  onRemove,
  onPreview,
  onDownload,
  onRetry,
}: {
  name: string;
  status: string;
  size?: number | undefined;
  working?: boolean;
  onRemove: () => void;
  onPreview?: (() => void) | undefined;
  onDownload?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const extension = name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 8) : '文件';
  const bytes =
    size === undefined
      ? ''
      : size < 1024
        ? size + ' B'
        : size < 1048576
          ? Math.ceil(size / 1024) + ' KB'
          : (size / 1048576).toFixed(1) + ' MB';
  return (
    <div className="composer-attachment" data-working={working || undefined}>
      <span className="attachment-file-icon">
        <UiIcon name="file" />
      </span>
      <div className="attachment-description">
        <button
          type="button"
          className="attachment-name"
          data-tooltip={name}
          onClick={onPreview}
          disabled={!onPreview}
        >
          {name}
        </button>
        <span className="attachment-status" role="status">
          {[extension, bytes, status].filter(Boolean).join(' · ')}
        </span>
      </div>
      {(onPreview || onDownload || onRetry) && (
        <ActionPopover label={'附件操作 ' + name} className="attachment-menu" icon="more">
          {onPreview && <button onClick={onPreview}>预览</button>}
          {onDownload && <button onClick={onDownload}>下载原件</button>}
          {onRetry && <button onClick={onRetry}>重试读取</button>}
        </ActionPopover>
      )}
      <IconButton
        className="attachment-remove"
        icon="close"
        label={'移除附件 ' + name}
        onClick={onRemove}
      />
    </div>
  );
}
