// Protocol-only check: no user prompt, generation or credential output.
import { query } from '@anthropic-ai/claude-agent-sdk';
import { resolve } from 'node:path';
const controller = new AbortController();
let stream, release;
const timer = setTimeout(() => controller.abort(), 20000);
const childEnv = Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TMPDIR','TEMP','SystemRoot','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
if (process.env.CODE_AUTH_HOME) childEnv.HOME = resolve(process.env.CODE_AUTH_HOME);
if (process.env.CODE_CLAUDE_CONFIG_DIR) childEnv.CLAUDE_CONFIG_DIR = resolve(process.env.CODE_CLAUDE_CONFIG_DIR);
try {
  stream = query({prompt:(async function*(){await new Promise(ok=>release=ok);})(),options:{
    cwd:process.cwd(),env:childEnv,settingSources:[],strictMcpConfig:true,mcpServers:{},
    tools:[],abortController:controller,stderr:()=>{},
    ...(process.env.CLAUDE_CODE_EXECUTABLE ? {pathToClaudeCodeExecutable:resolve(process.env.CLAUDE_CODE_EXECUTABLE)} : {})
  }});
  const info = await stream.initializationResult();
  console.log(JSON.stringify({initialized:true,modelCount:info.models?.length || 0,credentialValuesPrinted:false,inferenceSent:false}));
} catch {
  console.error(JSON.stringify({initialized:false,message:'CLI 启动或协议握手失败，请核对运行时路径及服务端环境。',inferenceSent:false}));
  process.exitCode=1;
} finally {clearTimeout(timer);release?.();stream?.close();}
