"use client";
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { FloatingPopover } from './FloatingPopover';
import { cn } from '@/src/lib/utils';

export type SelectOption = { value: string; label: React.ReactNode; disabled?: boolean; textValue?: string };
export type SelectGroup = { label: string; options: SelectOption[] };
export type SelectItem = SelectOption | SelectGroup;
interface CustomSelectProps {
  value: string; onChange: (value: string) => void; items: SelectItem[];
  className?: string; triggerClassName?: string; placeholder?: string; disabled?: boolean;
  dropdownAlign?: 'left' | 'right'; id?: string; name?: string;
  dropdownWidth?: number | 'anchor'; dropdownClassName?: string;
  'aria-label'?: string; 'aria-labelledby'?: string; triggerLabel?: React.ReactNode;
}
function plainText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return plainText(node.props.children);
  return '';
}
/** One themed, portalled select for all forms. Focus stays on the combobox. */
export function CustomSelect({ value, onChange, items, className, triggerClassName, placeholder = '—', disabled,
  dropdownAlign = 'left', dropdownWidth, dropdownClassName, id, name, triggerLabel, ...aria }: CustomSelectProps) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId(), search = useRef({ text: '', time: 0 });
  const options = useMemo(() => items.flatMap(item => 'options' in item ? item.options : [item]), [items]);
  const selected = options.find(option => option.value === value);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  const select = (index: number) => { const option = options[index]; if (!option || option.disabled) return; onChange(option.value); close(); };
  const first = () => options.findIndex(option => !option.disabled);
  const last = () => { for (let n = options.length - 1; n >= 0; n--) if (!options[n].disabled) return n; return -1; };
  const start = (end = false) => { setActive(end ? last() : Math.max(first(), options.findIndex(option => option.value === value && !option.disabled))); setOpen(true); };
  const move = (step: number) => {
    let index = active;
    for (let n = 0; n < options.length; n++) { index = (index + step + options.length) % options.length; if (!options[index].disabled) { setActive(index); break; } }
  };
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === 'Tab') { setOpen(false); return; }
    if (['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (!open) start(event.key === 'End' || event.key === 'ArrowUp');
      else if (event.key === 'ArrowDown') move(1);
      else if (event.key === 'ArrowUp') move(-1);
      else if (event.key === 'Home') setActive(first());
      else if (event.key === 'End') setActive(last());
      else select(active);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = performance.now();
      search.current.text = (now - search.current.time > 700 ? '' : search.current.text) + event.key.toLocaleLowerCase();
      search.current.time = now;
      const index = options.findIndex(option => !option.disabled && (option.textValue || plainText(option.label)).trim().toLocaleLowerCase().startsWith(search.current.text));
      if (index >= 0) { setActive(index); setOpen(true); }
    }
  };
  useEffect(() => {
    if (!open) return;
    const item = document.getElementById(`${listId}-${active}`);
    const panel = item?.closest<HTMLElement>('[data-field-popover]');
    if (!item || !panel) return;
    const row = item.getBoundingClientRect(), viewport = panel.getBoundingClientRect();
    // scrollIntoView also scrolls the document. Only move this menu's viewport.
    if (row.top < viewport.top) panel.scrollTop -= viewport.top - row.top;
    else if (row.bottom > viewport.bottom) panel.scrollTop += row.bottom - viewport.bottom;
  }, [active, open, listId]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return <div className={cn('ui-select', className)}>
    {name && <input type="hidden" name={name} value={value}/>}
    <button {...aria} id={id || `${listId}-trigger`} ref={trigger} type="button" role="combobox" aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      disabled={disabled} className={cn('ui-select-trigger', triggerClassName)} onKeyDown={keys} onClick={() => open ? close() : start()}>
      <span className="min-w-0 truncate">{triggerLabel ?? selected?.label ?? placeholder}</span><ChevronDown size={14} className="shrink-0 text-muted"/>
    </button>
    <FloatingPopover open={open} anchor={trigger} onClose={() => setOpen(false)} align={dropdownAlign} width={dropdownWidth} className={cn('ui-select-popover', dropdownClassName)}>
      <div id={listId} role="listbox" aria-label={aria['aria-label']} aria-labelledby={aria['aria-labelledby'] || (!aria['aria-label'] ? (id || `${listId}-trigger`) : undefined)} data-select-menu className="ui-select-menu">
        {items.map((item, groupIndex) => <React.Fragment key={'options' in item ? `group-${groupIndex}` : item.value}>
          {'options' in item && <div className="ui-select-group">{item.label}</div>}
          {('options' in item ? item.options : [item]).map(option => { const index = options.indexOf(option); return <div
            key={option.value} id={`${listId}-${index}`} role="option" aria-selected={value === option.value} aria-disabled={option.disabled || undefined}
            className={cn('ui-select-option', active === index && 'active')} onPointerMove={() => !option.disabled && setActive(index)}
            onPointerDown={event => event.preventDefault()} onClick={() => select(index)}>
            <span>{option.label}</span>{value === option.value && <Check size={15} className="shrink-0"/>}
          </div>; })}
        </React.Fragment>)}
      </div>
    </FloatingPopover>
  </div>;
}
