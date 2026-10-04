import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeletionScreen } from '../../apps/mobile/src/screens/DeletionScreen';

const mocks=vi.hoisted(()=>({request:vi.fn(),cancel:vi.fn(),status:vi.fn(),uuid:vi.fn()}));
vi.mock('react-native',()=>{
  const host=(tag:string)=>{
    function Host({children,...props}:{children?:unknown}&Record<string,unknown>) {return createElement(tag,props,children as never);}
    Host.displayName=`Mock${tag}`;
    return Host;
  };
  return {ScrollView:host('main'),Text:host('span'),TextInput:host('input'),View:host('div'),Pressable:host('button'),StyleSheet:{create:(v:unknown)=>v}};
});
vi.mock('expo-crypto',()=>({randomUUID:mocks.uuid}));
vi.mock('../../apps/mobile/src/deletion-api',()=>({requestDeletion:mocks.request,cancelDeletion:mocks.cancel,statusDeletion:mocks.status,
  deletionStatusMessage:()=>'',recentAuthMessage:(m:string)=>m}));

const active={accountStatus:'active',tombstoneExists:false,deletedAt:null,purgeCompletedAt:null,deletionReason:null};
let consoleSpy:ReturnType<typeof vi.spyOn>;
const originalConsoleError=console.error.bind(console);
beforeAll(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  consoleSpy=vi.spyOn(console,'error');
});
afterAll(()=>consoleSpy.mockRestore());
beforeEach(()=>{
  vi.resetAllMocks();
  consoleSpy.mockImplementation((message?:unknown,...details:unknown[])=>{
    if(String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message,...details);
  });
  mocks.uuid.mockReturnValueOnce('first-operation').mockReturnValue('next-operation');
  mocks.status.mockResolvedValue(active);
});
function input(renderer:ReactTestRenderer,label:string,value:string) {
  renderer.root.find(n=>n.type==='input'&&n.props.accessibilityLabel===label).props.onChangeText(value);
}
function press(renderer:ReactTestRenderer,label:string) {
  renderer.root.find(n=>n.type==='button'&&n.props.accessibilityLabel===label).props.onPress();
}
describe('account deletion screen retry behavior',()=>{
  it('retries a lost response using the same request and offers status refresh',async()=>{
    mocks.request.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce({accountStatus:'deleting'});
    let renderer!:ReactTestRenderer;
    await act(async()=>{renderer=create(createElement(DeletionScreen));});
    await act(async()=>{input(renderer,'Reason for deletion','Original reason');input(renderer,'Deletion confirmation','DELETE MY ACCOUNT');});
    await act(async()=>{press(renderer,'Delete my account');});
    expect(mocks.request).toHaveBeenNthCalledWith(1,'first-operation','Original reason');
    expect(renderer.root.find(n=>n.type==='input'&&n.props.accessibilityLabel==='Reason for deletion').props.editable).toBe(false);
    expect(renderer.root.find(n=>n.type==='button'&&n.props.accessibilityLabel==='Refresh status')).toBeDefined();
    await act(async()=>{input(renderer,'Reason for deletion','Changed reason');press(renderer,'Retry deletion');});
    expect(mocks.request).toHaveBeenNthCalledWith(2,'first-operation','Original reason');
    await act(async()=>renderer.unmount());
  });
  it('refreshes status after a lost response so cancellation remains reachable',async()=>{
    mocks.request.mockRejectedValueOnce(new Error('Connection interrupted'));
    let renderer!:ReactTestRenderer;
    await act(async()=>{renderer=create(createElement(DeletionScreen));});
    await act(async()=>input(renderer,'Deletion confirmation','DELETE MY ACCOUNT'));
    await act(async()=>press(renderer,'Delete my account'));
    mocks.status.mockResolvedValueOnce({...active,accountStatus:'deleting',tombstoneExists:true});
    await act(async()=>press(renderer,'Refresh status'));
    expect(renderer.root.find(n=>n.type==='button'&&n.props.accessibilityLabel==='Cancel deletion')).toBeDefined();
    mocks.cancel.mockResolvedValueOnce({accountStatus:'active'});
    await act(async()=>press(renderer,'Cancel deletion'));
    await act(async()=>input(renderer,'Deletion confirmation','DELETE MY ACCOUNT'));
    mocks.request.mockResolvedValueOnce({accountStatus:'deleting'});
    await act(async()=>press(renderer,'Delete my account'));
    expect(mocks.request).toHaveBeenLastCalledWith('next-operation',null);
    await act(async()=>renderer.unmount());
  });
});
