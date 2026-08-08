import { Form, InputGroup } from "react-bootstrap";

export function WikiSearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <InputGroup className="wiki-search-box">
      <InputGroup.Text>
        <i className="fa-solid fa-magnifying-glass" />
      </InputGroup.Text>
      <Form.Control
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search install, nodes, backups, API, security..."
        aria-label="Search wiki"
      />
    </InputGroup>
  );
}
