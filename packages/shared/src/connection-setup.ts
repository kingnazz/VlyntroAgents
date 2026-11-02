import { readFile } from 'node:fs/promises';
import { clientKind } from './connections.js';
const clients = {
  chatgpt: {
    name: 'ChatGPT',
    home: 'https://chatgpt.com',
    docs: 'https://developers.openai.com/plugins/build/auth',
    steps: [
      'Open ChatGPT’s apps/plugins settings and add a custom MCP app (developer mode or workspace permission may be required).',
      'Paste the MCP URL below and use OAuth authentication.',
      'Connect, sign in to Agent HQ, choose the workspace and approve the displayed access.',
      'Enable the connector in your conversation and ask it to check its Brain connection.',
    ],
  },
  codex: {
    name: 'Codex',
    home: 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli',
    docs: 'https://learn.chatgpt.com/docs/extend/mcp?surface=cli',
    steps: [
      'Run the setup command below in the environment where Codex runs.',
      'Run codex mcp login vlyntro-brain and complete the owner sign-in and consent in your browser.',
      'Install the optional skill in your user skills directory, then start a new Codex chat.',
      'Ask Codex to use get_brain_connection and search_brain to verify its workspace and read access.',
    ],
  },
  claude: {
    name: 'Claude',
    home: 'https://claude.ai',
    docs: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
    steps: [
      'In Claude, open Customize → Connectors → Add custom connector (organization owners may need to add it first).',
      'Name it Vlyntro Brain and paste the MCP URL below.',
      'Choose OAuth/sign-in authentication and complete Agent HQ owner consent.',
      'Enable the connector in your conversation. The optional skill adds guidance for search and capture.',
    ],
  },
  'claude-code': {
    name: 'Claude Code',
    home: 'https://code.claude.com/docs/en/mcp',
    docs: 'https://code.claude.com/docs/en/mcp',
    steps: [
      'Run the setup command below.',
      'Open /mcp in Claude Code, authenticate Vlyntro Brain, and finish owner sign-in in your browser.',
      'Install the optional skill or local plugin, then start a new session.',
      'Ask Claude Code to check get_brain_connection and search_brain.',
    ],
  },
  grok: {
    name: 'Grok',
    home: 'https://grok.com/connectors',
    docs: 'https://docs.x.ai/grok/connectors',
    steps: [
      'Open Grok → Connectors → New Connector → Custom. Business/Enterprise accounts may require an administrator.',
      'Paste the MCP URL below and complete the authentication flow offered by Grok.',
      'Sign in to Agent HQ and approve the workspace and access.',
      'Enable the connector and ask Grok to check its Brain connection. Client-specific availability and installation remain controlled by Grok.',
    ],
  },
  muse: {
    name: 'Muse',
    home: 'https://agents.vlyntro.com/app?view=settings',
    docs: 'https://agents.vlyntro.com/app?view=settings',
    steps: [
      'Muse is the Anthropic-powered agent already running inside Agent HQ. Its Brain permissions and worker context are built in.',
      'Its execution requires an Anthropic provider key in the protected server environment. This is separate from connecting your Claude app.',
      'If you also use an external Muse client, give that client its own connection label and use the MCP URL with OAuth or an advanced access token.',
    ],
  },
  other: {
    name: 'Other AI',
    home: 'https://modelcontextprotocol.io',
    docs: 'https://modelcontextprotocol.io',
    steps: [
      'Add a remote Streamable HTTP MCP server in your AI client.',
      'Use the MCP URL below and select OAuth with dynamic client registration and S256 PKCE.',
      'Complete owner sign-in and consent, then verify get_brain_connection and search_brain.',
      'For clients limited to static bearer credentials, use Advanced access token in Agent HQ and store the credential in the client’s secure settings.',
    ],
  },
} as const;
export function setupGuide(kind: string, origin: string) {
  const key = clientKind.parse(kind),
    client = clients[key],
    url = origin + '/mcp';
  const command =
    key === 'codex'
      ? `codex mcp add vlyntro-brain --url ${url}`
      : key === 'claude-code'
        ? `claude mcp add --transport http --scope user vlyntro-brain ${url}`
        : null;
  const prompt = `Set up Vlyntro Brain for ${client.name}. Read and follow ${origin}/api/v1/connections/setup/${key}. Use OAuth and complete the owner's browser consent; do not ask for credentials in chat. ${command ? 'Configure the MCP connection and install the optional vlyntro-brain skill in the user skills directory.' : 'Explain the client settings steps if you cannot configure this app directly.'} Verify get_brain_connection and a bounded search_brain call. Only report a connected state after a real authenticated tool call succeeds. Search relevant Brain context before work and capture material durable outcomes afterward when authorized. Preserve attribution and human decision confirmation.`;
  return {
    kind: key,
    name: client.name,
    mcp_url: url,
    home: client.home,
    docs: client.docs,
    steps: client.steps,
    command,
    setup_prompt: prompt,
    skill_url: origin + '/api/v1/connections/skill.zip',
    plugin_url: origin + '/api/v1/connections/plugin.zip',
  };
}
export const allSetupGuides = (origin: string) =>
  Object.keys(clients).map((kind) => setupGuide(kind, origin));
export async function connectorSkill(origin: string) {
  return (
    await readFile(
      new URL('../connector/skills/vlyntro-brain/SKILL.md', import.meta.url),
      'utf8',
    )
  ).replaceAll('{{MCP_URL}}', origin + '/mcp');
}
// A small standards-compliant ZIP with fixed, trusted paths; no executable installer or secrets.
export function zipFiles(files: Record<string, string>) {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  function crc32(buf: Buffer) {
    let crc = 0xffffffff;
    for (const byte of buf) {
      crc ^= byte;
      for (let n = 0; n < 8; n++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  for (const [path, value] of Object.entries(files)) {
    const name = Buffer.from(path),
      data = Buffer.from(value),
      crc = crc32(data),
      header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8);
    entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22),
    count = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export async function connectorBundle(origin: string, plugin = false) {
  const skill = await connectorSkill(origin);
  if (!plugin) return zipFiles({ 'vlyntro-brain/SKILL.md': skill });
  return zipFiles({
    'plugin.json': JSON.stringify(
      {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
        name: 'vlyntro-brain',
        version: '1.0.0',
        description: 'Attributed Second Brain context and capture for Vlyntro.',
        author: { name: 'Vlyntro', url: origin },
        extensions: { 'com.openai': {} },
      },
      null,
      2,
    ),
    'mcp.json': JSON.stringify(
      {
        $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
        mcpServers: {
          'vlyntro-brain': {
            type: 'streamable-http',
            url: origin + '/mcp',
            extensions: {
              'com.openai': {
                auth: {
                  type: 'oauth',
                  client: { mode: 'dcr' },
                  baseScopes: ['brain.read'],
                  defaultScopes: [
                    'brain.read',
                    'brain.propose',
                    'offline_access',
                  ],
                },
              },
            },
          },
        },
      },
      null,
      2,
    ),
    '.codex-plugin/plugin.json': JSON.stringify(
      {
        name: 'vlyntro-brain',
        version: '1.0.0',
        description: 'Attributed Second Brain context and capture for Vlyntro.',
        skills: './skills/',
        mcpServers: './.mcp.json',
      },
      null,
      2,
    ),
    '.claude-plugin/plugin.json': JSON.stringify(
      {
        name: 'vlyntro-brain',
        version: '1.0.0',
        description: 'Attributed Second Brain context and capture for Vlyntro.',
        author: { name: 'Vlyntro', url: origin },
      },
      null,
      2,
    ),
    '.mcp.json': JSON.stringify(
      {
        mcpServers: { 'vlyntro-brain': { type: 'http', url: origin + '/mcp' } },
      },
      null,
      2,
    ),
    'skills/vlyntro-brain/SKILL.md': skill,
  });
}
