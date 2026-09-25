import { AttachmentIcon, CloseIcon, OpenIcon } from "outline-icons";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import type { DatabaseAttachmentValue } from "@shared/databases/types";
import { s } from "@shared/styles";
import { bytesToHumanReadable } from "@shared/utils/files";
import ButtonSmall from "~/components/ButtonSmall";
import NudeButton from "~/components/NudeButton";
import useStores from "~/hooks/useStores";
import { EditorPopover } from "./components/EditorPopover";
import { Chips, EmptyValue } from "./components/styles";
import { isWritable } from "./editable";
import { isAttachmentItem, toArray } from "./format";
import { stopPropagation } from "./hooks";
import type {
  CellDefinition,
  CellEditorProps,
  CellRendererProps,
} from "./types";

/** Files: image thumbnails, or the file name with an icon. */
export const attachmentCell: CellDefinition = {
  Renderer: AttachmentRenderer,
  Editor: AttachmentEditor,
  isEditable: isWritable,
};

/**
 * The files of an attachment cell.
 *
 * @param value the cell value.
 * @returns the attachments, in order.
 */
export function attachmentsOf(
  value: CellRendererProps["value"]
): DatabaseAttachmentValue[] {
  return toArray(value).filter(isAttachmentItem);
}

/**
 * Whether an attachment can be drawn as an image thumbnail.
 *
 * @param attachment the attachment.
 * @returns true for images with a URL.
 */
export function isImageAttachment(
  attachment: DatabaseAttachmentValue
): boolean {
  return (
    attachment.mimetype.startsWith("image/") &&
    !!(attachment.thumbnailUrl ?? attachment.url)
  );
}

function AttachmentRenderer({ value, variant, wrap }: CellRendererProps) {
  const { t } = useTranslation();
  const attachments = attachmentsOf(value);

  if (!attachments.length) {
    return variant === "property" ? (
      <EmptyValue>{t("Empty")}</EmptyValue>
    ) : null;
  }

  const size = variant === "property" ? 48 : 24;
  return (
    <Chips $variant={variant} $wrap={wrap}>
      {attachments.map((attachment) =>
        isImageAttachment(attachment) ? (
          <a
            key={attachment.id}
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            title={attachment.name}
            onClick={stopPropagation}
          >
            <Thumbnail
              src={attachment.thumbnailUrl ?? attachment.url}
              alt={attachment.name}
              $size={size}
            />
          </a>
        ) : (
          <FileChip
            key={attachment.id}
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            title={attachment.name}
            onClick={stopPropagation}
          >
            <AttachmentIcon size={16} />
            <FileName>{attachment.name}</FileName>
          </FileChip>
        )
      )}
    </Chips>
  );
}

function AttachmentEditor(props: CellEditorProps) {
  const { database, field, value, record, onChange, onClose } = props;
  const { t } = useTranslation();
  const { databaseRecords } = useStores();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(0);
  const attachments = attachmentsOf(value);

  const handleFiles = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (!record || !files.length) {
        return;
      }
      setUploading((count) => count + files.length);
      for (const file of files) {
        try {
          await databaseRecords.upload(database.id, record.id, field.id, file);
        } catch {
          toast.error(t("Could not upload {{ name }}", { name: file.name }));
        } finally {
          setUploading((count) => count - 1);
        }
      }
    },
    [database.id, databaseRecords, field.id, record, t]
  );

  const handleRemove = React.useCallback(
    (id: string) => {
      const next = attachments.filter((attachment) => attachment.id !== id);
      onChange(next.length ? next : null);
    },
    [attachments, onChange]
  );

  return (
    <EditorPopover
      anchor={<AttachmentRenderer {...props} />}
      label={t("Edit files")}
      onClose={onClose}
    >
      <List>
        {attachments.map((attachment) => (
          <FileRow key={attachment.id}>
            {isImageAttachment(attachment) ? (
              <Thumbnail
                src={attachment.thumbnailUrl ?? attachment.url}
                alt=""
                $size={32}
              />
            ) : (
              <AttachmentIcon size={24} />
            )}
            <FileName title={attachment.name}>{attachment.name}</FileName>
            <FileSize>{bytesToHumanReadable(attachment.size)}</FileSize>
            {attachment.url && (
              <NudeButton
                as="a"
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("Open")}
              >
                <OpenIcon size={20} />
              </NudeButton>
            )}
            <NudeButton
              aria-label={t("Remove")}
              onClick={() => handleRemove(attachment.id)}
            >
              <CloseIcon size={20} />
            </NudeButton>
          </FileRow>
        ))}
      </List>
      <Footer>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={handleFiles}
        />
        <ButtonSmall
          neutral
          disabled={!record || uploading > 0}
          onClick={() => inputRef.current?.click()}
        >
          {uploading > 0 ? `${t("Uploading")}…` : t("Upload a file")}
        </ButtonSmall>
      </Footer>
    </EditorPopover>
  );
}

const Thumbnail = styled.img<{ $size: number }>`
  display: block;
  height: ${(props) => props.$size}px;
  max-width: ${(props) => props.$size * 2}px;
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid ${s("divider")};
`;

const FileChip = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  padding: 0 6px 0 2px;
  border-radius: 3px;
  font-size: 13px;
  color: ${s("text")};
  background: ${s("backgroundSecondary")};
`;

const FileName = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const FileSize = styled.span`
  font-size: 12px;
  color: ${s("textTertiary")};
`;

const List = styled.div`
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
`;

const FileRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  font-size: 14px;
  color: ${s("text")};
`;

const Footer = styled.div`
  padding: 8px 12px;
  border-top: 1px solid ${s("divider")};
`;
