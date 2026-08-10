export type ComponentAction = "attend" | "tentative" | "delete";

export type ParsedInteraction =
  | { kind: "component"; action: ComponentAction; scheduleId: number }
  | { kind: "delete-confirm"; scheduleId: number };

export function componentId(
  action: ComponentAction,
  scheduleId: number,
): string {
  return `sb:${action}:${scheduleId}`;
}

export function deletionModalId(scheduleId: number): string {
  return `sb:delete-confirm:${scheduleId}`;
}

export function parseInteractionId(value: string): ParsedInteraction | null {
  const component = /^sb:(attend|tentative|delete):([1-9]\d{0,9})$/.exec(value);
  if (component?.[1] && component[2])
    return {
      kind: "component",
      action: component[1] as ComponentAction,
      scheduleId: Number(component[2]),
    };
  const legacy = /^(Accept|Tentative|Delete)_([1-9]\d{0,9})$/.exec(value);
  if (legacy?.[1] && legacy[2]) {
    const actions: Record<string, ComponentAction> = {
      Accept: "attend",
      Tentative: "tentative",
      Delete: "delete",
    };
    return {
      kind: "component",
      action: actions[legacy[1]] ?? "delete",
      scheduleId: Number(legacy[2]),
    };
  }
  const modal = /^sb:delete-confirm:([1-9]\d{0,9})$/.exec(value);
  if (modal?.[1])
    return { kind: "delete-confirm", scheduleId: Number(modal[1]) };
  return null;
}
