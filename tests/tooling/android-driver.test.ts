import { describe, expect, it } from 'vitest';

import { findContaining, findEditableExact, findExact, parseUiXml, typeText } from '../../scripts/android-driver';

const XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="za.co.strandcue.app" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" bounds="[0,0][1080,2400]">
<node index="1" text="" class="android.view.ViewGroup" content-desc="Tool type: Hair dryer" checkable="false" checked="true" clickable="true" enabled="true" focused="false" bounds="[100,200][500,296]" />
<node index="2" text="Hair dryer" class="android.widget.TextView" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focused="false" bounds="[120,220][480,276]" />
<node index="3" text="Salon &amp; &quot;Home&quot;" class="android.widget.EditText" content-desc="Brand (as printed)" checkable="false" checked="false" clickable="true" enabled="false" focused="true" bounds="[100,400][980,496]" />
</node></hierarchy>`;

describe('the Android acceptance driver (pure parts)', () => {
  it('reads the accessibility tree the way a screen reader would, with decoded text, flags and bounds', () => {
    const nodes = parseUiXml(XML);
    expect(nodes).toHaveLength(4);
    expect(nodes[1]).toMatchObject({ label: 'Tool type: Hair dryer', clickable: true, checked: true, bounds: [100, 200, 500, 296] });
    expect(nodes[3]).toMatchObject({ text: 'Salon & "Home"', enabled: false, focused: true });
  });

  it('finds an element by exact label or text, preferring the one that can be pressed, and by fragment', () => {
    const nodes = parseUiXml(XML);
    expect(findExact(nodes, 'Tool type: Hair dryer')?.clickable).toBe(true);
    expect(findExact(nodes, 'Hair dryer')?.text).toBe('Hair dryer');
    expect(findExact(nodes, 'Nothing here')).toBeUndefined();
    expect(findContaining(nodes, 'as printed')?.label).toBe('Brand (as printed)');
    expect(findContaining(nodes, 'zzz')).toBeUndefined();
  });

  it('selects the editable control when a field label and input have the same accessible name', () => {
    const nodes = parseUiXml(`<hierarchy>
      <node text="Product name" class="android.widget.TextView" content-desc="" clickable="true" enabled="true" focused="false" bounds="[100,200][980,250]" />
      <node text="" class="android.widget.EditText" content-desc="Product name" clickable="true" enabled="true" focused="false" bounds="[100,260][980,360]" />
    </hierarchy>`);

    expect(findExact(nodes, 'Product name')?.className).toBe('android.widget.TextView');
    expect(findEditableExact(nodes, 'Product name')?.className).toBe('android.widget.EditText');
  });

  it('ignores a node without readable bounds and refuses text adb cannot type safely', () => {
    expect(parseUiXml('<node text="x" content-desc="" class="a" bounds="oops" />')).toEqual([]);
    expect(() => typeText('semi;colon')).toThrow('UNSUPPORTED_CHARACTER');
    expect(() => typeText('quote"')).toThrow('UNSUPPORTED_CHARACTER');
  });
});
