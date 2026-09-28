import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import { useEditor } from "./EditorContext";
import Input from "./Input";

type Props = {
  /** The index of the column */
  index: number;
  /** The column's current formula */
  formula: string | null;
};

/**
 * Edits the formula of a table column, written as in Notion:
 * prop("Jours") * prop("TJM"), if(prop("Signé"), "oui", "non")…
 */
function ColumnFormulaInput({ index, formula }: Props) {
  const { t } = useTranslation();
  const { commands, view } = useEditor();
  const [value, setValue] = useState(formula ?? "");

  const apply = useCallback(() => {
    commands.setColumnFormula({ index, formula: value || null });
    view.focus();
  }, [commands, view, index, value]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        apply();
      }
    },
    [apply]
  );

  return (
    <Wrapper>
      <Input
        autoFocus
        value={value}
        placeholder={`prop("Jours") * prop("TJM")`}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
      />
      <Help>
        {t(
          'Press Enter to apply. Read other columns with prop("Name"), as in Notion. Empty the field to turn the column back into plain text.'
        )}
      </Help>
    </Wrapper>
  );
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  width: 340px;
  font-family: ${s("fontFamilyMono")};
`;

const Help = styled.div`
  font-family: ${s("fontFamily")};
  font-size: 12px;
  color: ${s("textTertiary")};
`;

export default ColumnFormulaInput;
