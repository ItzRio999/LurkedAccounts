const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const multer = require("multer");
const { EmbedBuilder } = require("discord.js");
const { loadJson, saveJson, CONFIG_PATH, DATA_PATH } = require("../utils/fileManager");

class ApiServer {
  constructor(discordClient) {
    this.client = discordClient;
    this.app = express();
    this.config = loadJson(CONFIG_PATH, null);
    this.data = null;

    // Cache for stats to prevent rate limiting
    this.statsCache = {
      data: null,
      timestamp: 0,
      ttl: 30000 // Cache for 30 seconds
    };

    // Configure middleware
    this.app.use(cors({
      origin: process.env.WEBSITE_URL || 'https://lurkedaccounts.tech',
      credentials: true
    }));
    this.app.use(express.json());

    this.setupRoutes();
  }

  setupRoutes() {
    const normalizeRecoveryCode = (code = "") =>
      code.toString().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

    const hashRecoveryCode = (code) =>
      crypto.createHash("sha256").update(code).digest("hex");

    const generateRecoveryCode = () => {
      const raw = crypto.randomBytes(8).toString("hex").toUpperCase();
      return raw.match(/.{1,4}/g).join("-");
    };

    const codesMatch = (storedHash, providedCode) => {
      if (!storedHash || !providedCode) {
        return false;
      }
      const providedHash = hashRecoveryCode(normalizeRecoveryCode(providedCode));
      const storedBuffer = Buffer.from(storedHash, "hex");
      const providedBuffer = Buffer.from(providedHash, "hex");
      if (storedBuffer.length !== providedBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(storedBuffer, providedBuffer);
    };

    const getVerifiedRoleId = () =>
      process.env.DISCORD_VERIFY_ROLE_ID || this.config.verify_role_id;

    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    });

    const loadVerificationData = () => {
      const data = loadJson(DATA_PATH, {});
      if (!data.discord_verifications) {
        data.discord_verifications = {};
      }
      return data;
    };

    const saveVerificationData = (data) => {
      saveJson(DATA_PATH, data);
    };

    const fetchDiscordUser = async (accessToken) => {
      const userResponse = await fetch("https://discord.com/api/users/@me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!userResponse.ok) {
        const error = await userResponse.json();
        throw new Error(error.error_description || "Failed to fetch Discord user");
      }

      return userResponse.json();
    };

    const getAdminRoleIds = () => {
      const adminRoles = this.config.admin_role_ids || [];
      const ownerRoles = this.config.owner_role_ids || [];
      const coownerRoles = this.config.coowner_role_ids || [];
      const staffRoles = this.config.staff_role_ids || [];
      return [...new Set([...adminRoles, ...ownerRoles, ...coownerRoles, ...staffRoles])];
    };

    const getPrimaryGuild = () => this.client.guilds.cache.get(this.config.guild_ids[0]);

    const getVerifyLogChannel = async () => {
      const channelId =
        process.env.DISCORD_VERIFY_LOG_CHANNEL_ID || this.config.verify_log_channel_id;
      if (!channelId) {
        return null;
      }
      const cached = this.client.channels.cache.get(channelId);
      if (cached) {
        return cached;
      }
      try {
        return await this.client.channels.fetch(channelId);
      } catch (error) {
        console.error("Error fetching verify log channel:", error);
        return null;
      }
    };

    const sendVerificationLog = async ({
      title,
      description,
      fields = [],
      color = 0x5865F2,
    }) => {
      const channel = await getVerifyLogChannel();
      if (!channel) {
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();

      if (fields.length) {
        embed.addFields(fields);
      }

      if (this.config.logo_url) {
        embed.setThumbnail(this.config.logo_url);
      }

      try {
        await channel.send({ embeds: [embed] });
      } catch (error) {
        console.error("Error sending verification log:", error);
      }
    };

    const formatTimestamp = (timestamp) => {
      if (!timestamp) return "Unknown";
      const unix = Math.floor(timestamp / 1000);
      return `<t:${unix}:F> (<t:${unix}:R>)`;
    };

    const sanitizeFileName = (fileName = "drop.txt") => {
      const baseName = path.basename(fileName);
      return baseName.replace(/[^\w.\- ()]/g, "_");
    };

    const getDropUploadChannel = async () => {
      const channelId =
        process.env.DISCORD_DROP_UPLOAD_CHANNEL_ID ||
        this.config.website_drop_channel_id ||
        this.config.drops_channel_id;
      if (!channelId) {
        return null;
      }
      const cached = this.client.channels.cache.get(channelId);
      if (cached) {
        return cached;
      }
      try {
        return await this.client.channels.fetch(channelId);
      } catch (error) {
        console.error("Error fetching drop upload channel:", error);
        return null;
      }
    };

    const sendDropWebhook = async ({ content, embeds }) => {
      const webhookUrl = process.env.DISCORD_DROP_WEBHOOK_URL;
      if (!webhookUrl) {
        return;
      }
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, embeds }),
        });
      } catch (error) {
        console.error("Error sending drop webhook:", error);
      }
    };

    const extractAccessToken = (req) => {
      const header = req.headers.authorization || "";
      if (header.startsWith("Bearer ")) {
        return header.slice(7);
      }
      const altHeader = req.headers["x-discord-access-token"];
      if (altHeader) {
        return altHeader;
      }
      if (req.body?.accessToken) {
        return req.body.accessToken;
      }
      return null;
    };

    const requireAdmin = async (req, res) => {
      const accessToken = extractAccessToken(req);
      if (!accessToken) {
        res.status(401).json({ error: "Access token required" });
        return null;
      }

      let discordUser;
      try {
        discordUser = await fetchDiscordUser(accessToken);
      } catch (error) {
        res.status(401).json({ error: "Invalid Discord access token" });
        return null;
      }

      const guild = getPrimaryGuild();
      if (!guild) {
        res.status(404).json({ error: "Guild not found" });
        return null;
      }

      let member;
      try {
        member = await guild.members.fetch(discordUser.id);
      } catch (error) {
        res.status(403).json({ error: "User not found in guild" });
        return null;
      }

      const adminRoleIds = getAdminRoleIds();
      const isGuildOwner = guild.ownerId === member.id;
      const hasAdminRole = adminRoleIds.some((roleId) => member.roles.cache.has(roleId));

      if (!hasAdminRole && !isGuildOwner) {
        res.status(403).json({ error: "Admin access required" });
        return null;
      }

      return { accessToken, discordUser, member, guild, adminRoleIds };
    };

    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        bot: this.client.user?.tag || 'not ready',
        uptime: process.uptime()
      });
    });

    // Get server stats
    this.app.get('/api/discord/stats', async (req, res) => {
      try {
        // Check cache first
        const now = Date.now();
        if (this.statsCache.data && (now - this.statsCache.timestamp) < this.statsCache.ttl) {
          return res.json(this.statsCache.data);
        }

        const guild = this.client.guilds.cache.get(this.config.guild_ids[0]);

        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }

        // Use cached member data - don't fetch members on every request
        // The bot already has members cached from when it started
        const totalMembers = guild.memberCount;

        // Count online members from cache (presences are already tracked)
        const onlineMembers = guild.members.cache.filter(
          member => member.presence?.status === 'online' ||
                    member.presence?.status === 'idle' ||
                    member.presence?.status === 'dnd'
        ).size;

        const boostCount = guild.premiumSubscriptionCount || 0;
        const boostLevel = guild.premiumTier;

        const stats = {
          totalMembers,
          onlineMembers,
          boostCount,
          boostLevel,
          serverName: guild.name,
          serverIcon: guild.iconURL({ dynamic: true, size: 256 })
        };

        // Update cache
        this.statsCache.data = stats;
        this.statsCache.timestamp = now;

        res.json(stats);
      } catch (error) {
        console.error('Error fetching server stats:', error);
        res.status(500).json({ error: 'Failed to fetch server stats' });
      }
    });

    // Get verified drops count from specific channel
    this.app.get('/api/discord/drops-count', async (req, res) => {
      try {
        const dropsChannelId = this.config.drops_channel_id;

        if (!dropsChannelId) {
          return res.status(400).json({ error: 'Drops channel not configured' });
        }

        const channel = this.client.channels.cache.get(dropsChannelId);

        if (!channel) {
          return res.status(404).json({ error: 'Drops channel not found' });
        }

        // Fetch messages from the channel (limit to last 100)
        const messages = await channel.messages.fetch({ limit: 100 });
        const messageCount = messages.size;

        res.json({
          count: messageCount,
          channelName: channel.name,
          channelId: dropsChannelId
        });
      } catch (error) {
        console.error('Error fetching drops count:', error);
        res.status(500).json({ error: 'Failed to fetch drops count' });
      }
    });

    // Get recent drops/announcements
    this.app.get('/api/discord/recent-drops', async (req, res) => {
      try {
        const dropsChannelId = this.config.drops_channel_id;
        const limit = parseInt(req.query.limit) || 10;

        if (!dropsChannelId) {
          return res.status(400).json({ error: 'Drops channel not configured' });
        }

        const channel = this.client.channels.cache.get(dropsChannelId);

        if (!channel) {
          return res.status(404).json({ error: 'Drops channel not found' });
        }

        const messages = await channel.messages.fetch({ limit: Math.min(limit, 50) });

        const drops = messages.map(msg => ({
          id: msg.id,
          content: msg.content,
          author: {
            username: msg.author.username,
            avatar: msg.author.displayAvatarURL({ dynamic: true, size: 128 })
          },
          timestamp: msg.createdTimestamp,
          attachments: msg.attachments.map(att => ({
            url: att.url,
            name: att.name
          })),
          embeds: msg.embeds.map(embed => ({
            title: embed.title,
            description: embed.description,
            color: embed.color,
            thumbnail: embed.thumbnail?.url,
            image: embed.image?.url
          }))
        }));

        res.json(drops);
      } catch (error) {
        console.error('Error fetching recent drops:', error);
        res.status(500).json({ error: 'Failed to fetch recent drops' });
      }
    });

    // Upload a file to the drops channel
    this.app.post('/api/discord/drop-upload', upload.single("file"), async (req, res) => {
      try {
        const admin = await requireAdmin(req, res);
        if (!admin) {
          return;
        }

        const channel = await getDropUploadChannel();
        if (!channel || !channel.isTextBased()) {
          return res.status(400).json({ error: "Drops channel not configured" });
        }

        const uploadedFile = req.file;
        if (!uploadedFile) {
          return res.status(400).json({ error: "File is required" });
        }

        const note = (req.body?.note || "").toString().trim();
        const websiteUser = (req.body?.websiteUser || "").toString().trim();
        const websiteEmail = (req.body?.websiteEmail || "").toString().trim();
        const safeName = sanitizeFileName(uploadedFile.originalname);
        const fileSizeKb = Math.max(1, Math.round(uploadedFile.size / 1024));

        const embed = new EmbedBuilder()
          .setTitle("Website drop received")
          .setDescription(note || "File uploaded from the website.")
          .setColor(0x7c5cff)
          .addFields([
            { name: "Discord User", value: `${admin.discordUser.username}`, inline: true },
            { name: "File", value: `${safeName} (${fileSizeKb} KB)`, inline: true },
            { name: "Website User", value: websiteUser || "Not provided", inline: true },
            { name: "Website Email", value: websiteEmail || "Not provided", inline: false },
          ])
          .setTimestamp();

        const message = await channel.send({
          content: `New drop from ${admin.discordUser.username}`,
          embeds: [embed],
          files: [{ attachment: uploadedFile.buffer, name: safeName }],
        });

        await sendDropWebhook({
          content: `Website drop uploaded by ${admin.discordUser.username}`,
          embeds: [
            {
              title: "Website drop received",
              description: note || "File uploaded from the website.",
              url: message.url,
              color: 0x7c5cff,
              fields: [
                { name: "File", value: `${safeName} (${fileSizeKb} KB)`, inline: true },
                { name: "Website User", value: websiteUser || "Not provided", inline: true },
                { name: "Website Email", value: websiteEmail || "Not provided", inline: false },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        });

        res.json({
          uploaded: true,
          messageUrl: message.url,
          fileName: safeName,
        });
      } catch (error) {
        console.error("Error uploading drop file:", error);
        res.status(500).json({ error: "Failed to upload drop" });
      }
    });

    // Discord OAuth callback endpoint
    this.app.post('/api/auth/discord/callback', async (req, res) => {
      try {
        const { code } = req.body;

        if (!code) {
          return res.status(400).json({ error: 'Authorization code required' });
        }

        // Exchange code for access token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: this.config.client_id,
            client_secret: process.env.DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.DISCORD_REDIRECT_URI || 'https://lurkedaccounts.tech/auth/discord/callback',
          }),
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
          return res.status(400).json({ error: tokenData.error_description || 'Failed to authenticate' });
        }

        // Fetch user info
        const userResponse = await fetch('https://discord.com/api/users/@me', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });

        const userData = await userResponse.json();

        // Check if user is in the guild
        const guild = this.client.guilds.cache.get(this.config.guild_ids[0]);
        let member = null;
        let roles = [];

        if (guild) {
          try {
            member = await guild.members.fetch(userData.id);
            roles = member.roles.cache.map(role => ({
              id: role.id,
              name: role.name,
              color: role.hexColor
            }));
          } catch (err) {
            console.log('User not in guild:', userData.username);
          }
        }

        res.json({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresIn: tokenData.expires_in,
          user: {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatar: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=256` : null,
            email: userData.email,
            verified: userData.verified,
            inGuild: !!member,
            roles: roles
          }
        });
      } catch (error) {
        console.error('Error in Discord OAuth callback:', error);
        res.status(500).json({ error: 'Authentication failed' });
      }
    });

    // Discord verification status
    this.app.get('/api/discord/verification/:userId', (req, res) => {
      const { userId } = req.params;
      const data = loadVerificationData();
      const record = data.discord_verifications[userId];

      if (!record) {
        return res.json({ verified: false, hasRecoveryCode: false });
      }

      res.json({
        verified: !!record.verifiedAt,
        verifiedAt: record.verifiedAt || null,
        lastVerifiedAt: record.lastVerifiedAt || null,
        hasRecoveryCode: !!record.recoveryCodeHash,
        recoveryCodeLast4: record.recoveryCodeLast4 || null,
      });
    });

    // Admin access check
    this.app.get('/api/admin/discord/access', async (req, res) => {
      const admin = await requireAdmin(req, res);
      if (!admin) {
        return;
      }

      res.json({
        isAdmin: true,
        discordId: admin.discordUser.id,
      });
    });

    // Admin: recent Discord verifications
    this.app.get('/api/admin/discord/verifications', async (req, res) => {
      const admin = await requireAdmin(req, res);
      if (!admin) {
        return;
      }

      const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
      const data = loadVerificationData();

      const entries = Object.entries(data.discord_verifications || {}).map(([discordId, record]) => {
        const member = admin.guild.members.cache.get(discordId);
        return {
          discordId,
          verifiedAt: record.verifiedAt || null,
          lastVerifiedAt: record.lastVerifiedAt || null,
          lastRecoveredAt: record.lastRecoveredAt || null,
          recoveryCodeLast4: record.recoveryCodeLast4 || null,
          websiteUserId: record.websiteUserId || null,
          websiteEmail: record.websiteEmail || null,
          websiteUsername: record.websiteUsername || null,
          revokedAt: record.revokedAt || null,
          revokedBy: record.revokedBy || null,
          discordTag: member?.user?.tag || null,
          avatar: member?.user?.displayAvatarURL({ dynamic: true, size: 128 }) || null,
        };
      });

      entries.sort((a, b) => {
        const aTime = new Date(a.lastVerifiedAt || a.verifiedAt || a.lastRecoveredAt || 0).getTime();
        const bTime = new Date(b.lastVerifiedAt || b.verifiedAt || b.lastRecoveredAt || 0).getTime();
        return bTime - aTime;
      });

      res.json(entries.slice(0, limit));
    });

    // Admin: recent verification logs
    this.app.get('/api/admin/discord/verification-logs', async (req, res) => {
      const admin = await requireAdmin(req, res);
      if (!admin) {
        return;
      }

      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
      const channel = await getVerifyLogChannel();

      if (!channel) {
        return res.status(400).json({ error: "Verification log channel not configured" });
      }

      try {
        const messages = await channel.messages.fetch({ limit });
        const logs = messages.map((message) => ({
          id: message.id,
          createdTimestamp: message.createdTimestamp,
          url: message.url,
          content: message.content || "",
          author: {
            username: message.author.username,
            avatar: message.author.displayAvatarURL({ dynamic: true, size: 64 }),
          },
          embeds: message.embeds.map((embed) => ({
            title: embed.title,
            description: embed.description,
            color: embed.color,
            fields: embed.fields?.map((field) => ({
              name: field.name,
              value: field.value,
              inline: field.inline,
            })) || [],
          })),
        }));

        res.json(logs);
      } catch (error) {
        console.error("Error fetching verification logs:", error);
        res.status(500).json({ error: "Failed to fetch verification logs" });
      }
    });

    // Admin: revoke Discord verification
    this.app.post('/api/admin/discord/verification/revoke', async (req, res) => {
      const admin = await requireAdmin(req, res);
      if (!admin) {
        return;
      }

      const { discordUserId, reason } = req.body || {};
      if (!discordUserId) {
        return res.status(400).json({ error: "discordUserId required" });
      }

      const data = loadVerificationData();
      const existing = data.discord_verifications[discordUserId];

      if (!existing) {
        return res.status(404).json({ error: "Verification record not found" });
      }

      let roleRemoved = false;
      const verifyRoleId = getVerifiedRoleId();
      if (verifyRoleId) {
        try {
          const member = await admin.guild.members.fetch(discordUserId);
          if (member.roles.cache.has(verifyRoleId)) {
            await member.roles.remove(verifyRoleId, "Verification revoked by admin");
            roleRemoved = true;
          }
        } catch (error) {
          console.error("Error removing verified role:", error);
        }
      }

      const now = new Date().toISOString();
      data.discord_verifications[discordUserId] = {
        ...existing,
        verifiedAt: null,
        lastVerifiedAt: existing.lastVerifiedAt || null,
        recoveryCodeHash: null,
        recoveryCodeLast4: null,
        recoveryCodeCreatedAt: null,
        revokedAt: now,
        revokedBy: admin.discordUser.id,
      };

      saveVerificationData(data);

      await sendVerificationLog({
        title: "Verification Revoked",
        description: `Verification was revoked for <@${discordUserId}>.`,
        color: 0xED4245,
        fields: [
          { name: "Discord ID", value: `\`${discordUserId}\``, inline: true },
          { name: "Admin", value: `<@${admin.discordUser.id}>`, inline: true },
          { name: "Role Removed", value: roleRemoved ? "Yes" : "No", inline: true },
          { name: "Reason", value: reason || "Not provided", inline: false },
        ],
      });

      res.json({ revoked: true, roleRemoved });
    });

    // Verify Discord account and assign verified role
    this.app.post('/api/auth/discord/verify', async (req, res) => {
      try {
        const { accessToken, websiteUserId, websiteEmail, websiteUsername } = req.body;

        if (!accessToken) {
          return res.status(400).json({ error: 'Access token required' });
        }

        const discordUser = await fetchDiscordUser(accessToken);
        const guild = getPrimaryGuild();

        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }

        let member;
        try {
          member = await guild.members.fetch(discordUser.id);
        } catch (err) {
          await sendVerificationLog({
            title: "Discord Verification Failed",
            description: "User not found in guild.",
            color: 0xED4245,
            fields: [
              { name: "Discord User", value: `${discordUser.username}`, inline: true },
              { name: "Discord ID", value: `\`${discordUser.id}\``, inline: true },
            ],
          });
          return res.status(403).json({ error: 'User not found in guild' });
        }

        const verifyRoleId = getVerifiedRoleId();
        if (!verifyRoleId) {
          await sendVerificationLog({
            title: "Discord Verification Failed",
            description: "Verified role not configured.",
            color: 0xED4245,
            fields: [
              { name: "Discord User", value: `${member.user.tag}`, inline: true },
              { name: "Discord ID", value: `\`${member.id}\``, inline: true },
            ],
          });
          return res.status(400).json({ error: 'Verified role not configured' });
        }

        const verifyRole = guild.roles.cache.get(verifyRoleId);
        if (!verifyRole) {
          await sendVerificationLog({
            title: "Discord Verification Failed",
            description: "Verified role not found in guild.",
            color: 0xED4245,
            fields: [
              { name: "Discord User", value: `${member.user.tag}`, inline: true },
              { name: "Discord ID", value: `\`${member.id}\``, inline: true },
              { name: "Role ID", value: `\`${verifyRoleId}\``, inline: true },
            ],
          });
          return res.status(404).json({ error: 'Verified role not found' });
        }

        let roleAssigned = false;
        if (!member.roles.cache.has(verifyRoleId)) {
          await member.roles.add(verifyRoleId, 'Website verification');
          roleAssigned = true;
        }

        const data = loadVerificationData();
        const existing = data.discord_verifications[discordUser.id] || {};
        const now = new Date().toISOString();

        data.discord_verifications[discordUser.id] = {
          ...existing,
          discordId: discordUser.id,
          websiteUserId: websiteUserId || existing.websiteUserId || null,
          websiteEmail: websiteEmail || existing.websiteEmail || null,
          websiteUsername: websiteUsername || existing.websiteUsername || null,
          verifiedAt: existing.verifiedAt || now,
          lastVerifiedAt: now,
        };

        saveVerificationData(data);

        await sendVerificationLog({
          title: "Discord Verified",
          description: `${member} verified via the website.`,
          color: 0x57F287,
          fields: [
            { name: "Discord User", value: `${member.user.tag}`, inline: true },
            { name: "Discord ID", value: `\`${member.id}\``, inline: true },
            { name: "Account Created", value: formatTimestamp(member.user.createdTimestamp), inline: false },
            { name: "Joined Server", value: formatTimestamp(member.joinedTimestamp), inline: false },
            { name: "Role Assigned", value: roleAssigned ? "Yes" : "Already had role", inline: true },
            {
              name: "Website User",
              value: websiteUserId || existing.websiteUserId ? `\`${websiteUserId || existing.websiteUserId}\`` : "Not provided",
              inline: true,
            },
            {
              name: "Website Email",
              value: websiteEmail || existing.websiteEmail || "Not provided",
              inline: true,
            },
            {
              name: "Website Username",
              value: websiteUsername || existing.websiteUsername || "Not provided",
              inline: true,
            },
          ],
        });

        res.json({
          verified: true,
          roleAssigned,
          verifiedAt: data.discord_verifications[discordUser.id].verifiedAt,
          recoveryCodeLast4: data.discord_verifications[discordUser.id].recoveryCodeLast4 || null,
        });
      } catch (error) {
        console.error('Error verifying Discord account:', error);
        res.status(500).json({ error: 'Verification failed' });
      }
    });

    // Generate a recovery code for a verified Discord account
    this.app.post('/api/auth/discord/recovery-code', async (req, res) => {
      try {
        const { accessToken } = req.body;

        if (!accessToken) {
          return res.status(400).json({ error: 'Access token required' });
        }

        const discordUser = await fetchDiscordUser(accessToken);
        const guild = getPrimaryGuild();

        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }

        try {
          await guild.members.fetch(discordUser.id);
        } catch (err) {
          return res.status(403).json({ error: 'User not found in guild' });
        }

        const data = loadVerificationData();
        const existing = data.discord_verifications[discordUser.id];

        if (!existing || !existing.verifiedAt) {
          await sendVerificationLog({
            title: "Recovery Code Failed",
            description: "User attempted recovery code generation before verification.",
            color: 0xED4245,
            fields: [
              { name: "Discord User", value: `${discordUser.username}`, inline: true },
              { name: "Discord ID", value: `\`${discordUser.id}\``, inline: true },
            ],
          });
          return res.status(403).json({ error: 'Verify your Discord account first' });
        }

        const recoveryCode = generateRecoveryCode();
        const normalized = normalizeRecoveryCode(recoveryCode);
        const recoveryCodeHash = hashRecoveryCode(normalized);

        data.discord_verifications[discordUser.id] = {
          ...existing,
          discordId: discordUser.id,
          recoveryCodeHash,
          recoveryCodeLast4: normalized.slice(-4),
          recoveryCodeCreatedAt: new Date().toISOString(),
        };

        saveVerificationData(data);

        await sendVerificationLog({
          title: "Recovery Code Generated",
          description: `${discordUser.username} generated a recovery code.`,
          color: 0xFEE75C,
          fields: [
            { name: "Discord User", value: `${discordUser.username}`, inline: true },
            { name: "Discord ID", value: `\`${discordUser.id}\``, inline: true },
            {
              name: "Recovery Code Last 4",
              value: data.discord_verifications[discordUser.id].recoveryCodeLast4 || "Unknown",
              inline: true,
            },
          ],
        });

        res.json({
          recoveryCode,
          recoveryCodeLast4: data.discord_verifications[discordUser.id].recoveryCodeLast4,
        });
      } catch (error) {
        console.error('Error generating recovery code:', error);
        res.status(500).json({ error: 'Failed to generate recovery code' });
      }
    });

    // Recover Discord verification using a recovery code
    this.app.post('/api/auth/discord/recover', async (req, res) => {
      try {
        const { accessToken, recoveryCode } = req.body;

        if (!accessToken || !recoveryCode) {
          return res.status(400).json({ error: 'Access token and recovery code required' });
        }

        const discordUser = await fetchDiscordUser(accessToken);
        const data = loadVerificationData();
        const existing = data.discord_verifications[discordUser.id];

        if (!existing || !existing.recoveryCodeHash) {
          await sendVerificationLog({
            title: "Recovery Failed",
            description: "No recovery code found for this account.",
            color: 0xED4245,
            fields: [
              { name: "Discord User", value: `${discordUser.username}`, inline: true },
              { name: "Discord ID", value: `\`${discordUser.id}\``, inline: true },
            ],
          });
          return res.status(404).json({ error: 'No recovery code found for this account' });
        }

        if (!codesMatch(existing.recoveryCodeHash, recoveryCode)) {
          await sendVerificationLog({
            title: "Recovery Failed",
            description: "Invalid recovery code provided.",
            color: 0xED4245,
            fields: [
              { name: "Discord User", value: `${discordUser.username}`, inline: true },
              { name: "Discord ID", value: `\`${discordUser.id}\``, inline: true },
            ],
          });
          return res.status(401).json({ error: 'Recovery code is invalid' });
        }

        const guild = getPrimaryGuild();
        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }

        let member;
        try {
          member = await guild.members.fetch(discordUser.id);
        } catch (err) {
          await sendVerificationLog({
            title: "Recovery Failed",
            description: "User not found in guild.",
            color: 0xED4245,
            fields: [
              { name: "Discord User", value: `${discordUser.username}`, inline: true },
              { name: "Discord ID", value: `\`${discordUser.id}\``, inline: true },
            ],
          });
          return res.status(403).json({ error: 'User not found in guild' });
        }

        const verifyRoleId = getVerifiedRoleId();
        if (!verifyRoleId) {
          await sendVerificationLog({
            title: "Recovery Failed",
            description: "Verified role not configured.",
            color: 0xED4245,
            fields: [
              { name: "Discord User", value: `${member.user.tag}`, inline: true },
              { name: "Discord ID", value: `\`${member.id}\``, inline: true },
            ],
          });
          return res.status(400).json({ error: 'Verified role not configured' });
        }

        const verifyRole = guild.roles.cache.get(verifyRoleId);
        if (!verifyRole) {
          await sendVerificationLog({
            title: "Recovery Failed",
            description: "Verified role not found in guild.",
            color: 0xED4245,
            fields: [
              { name: "Discord User", value: `${member.user.tag}`, inline: true },
              { name: "Discord ID", value: `\`${member.id}\``, inline: true },
              { name: "Role ID", value: `\`${verifyRoleId}\``, inline: true },
            ],
          });
          return res.status(404).json({ error: 'Verified role not found' });
        }

        if (!member.roles.cache.has(verifyRoleId)) {
          await member.roles.add(verifyRoleId, 'Website recovery verification');
        }

        const now = new Date().toISOString();
        data.discord_verifications[discordUser.id] = {
          ...existing,
          discordId: discordUser.id,
          verifiedAt: existing.verifiedAt || now,
          lastVerifiedAt: now,
          lastRecoveredAt: now,
        };

        saveVerificationData(data);

        await sendVerificationLog({
          title: "Verification Recovered",
          description: `${member} restored verification via recovery code.`,
          color: 0x57F287,
          fields: [
            { name: "Discord User", value: `${member.user.tag}`, inline: true },
            { name: "Discord ID", value: `\`${member.id}\``, inline: true },
            { name: "Account Created", value: formatTimestamp(member.user.createdTimestamp), inline: false },
            { name: "Joined Server", value: formatTimestamp(member.joinedTimestamp), inline: false },
            {
              name: "Recovery Code Last 4",
              value: existing.recoveryCodeLast4 || "Unknown",
              inline: true,
            },
          ],
        });

        res.json({
          recovered: true,
          verifiedAt: data.discord_verifications[discordUser.id].verifiedAt,
        });
      } catch (error) {
        console.error('Error recovering Discord verification:', error);
        res.status(500).json({ error: 'Recovery failed' });
      }
    });

    // Get user profile by Discord ID
    this.app.get('/api/discord/user/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const guild = this.client.guilds.cache.get(this.config.guild_ids[0]);

        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }

        const member = await guild.members.fetch(userId);

        if (!member) {
          return res.status(404).json({ error: 'User not found in guild' });
        }

        const roles = member.roles.cache
          .filter(role => role.id !== guild.id) // Filter out @everyone
          .map(role => ({
            id: role.id,
            name: role.name,
            color: role.hexColor,
            position: role.position
          }))
          .sort((a, b) => b.position - a.position);

        res.json({
          id: member.id,
          username: member.user.username,
          discriminator: member.user.discriminator,
          avatar: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
          nickname: member.nickname,
          joinedAt: member.joinedTimestamp,
          roles: roles,
          isPremium: member.premiumSince ? true : false,
          premiumSince: member.premiumSince
        });
      } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
      }
    });

    // Get leaderboard data
    this.app.get('/api/discord/leaderboard', (req, res) => {
      try {
        const data = loadJson(DATA_PATH, { levels: {} });
        const limit = parseInt(req.query.limit) || 10;

        // Convert levels object to array and sort by XP
        const leaderboard = Object.entries(data.levels || {})
          .map(([userId, userData]) => ({
            userId,
            level: userData.level || 0,
            xp: userData.xp || 0
          }))
          .sort((a, b) => b.xp - a.xp)
          .slice(0, limit);

        res.json(leaderboard);
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
    });

    // Get team members with specific role
    this.app.get('/api/discord/team-members', async (req, res) => {
      try {
        const teamRoleId = this.config.team_role_id;

        if (!teamRoleId) {
          return res.status(400).json({ error: 'Team role not configured' });
        }

        const guild = this.client.guilds.cache.get(this.config.guild_ids[0]);

        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }

        // Fetch all members with the team role
        const role = guild.roles.cache.get(teamRoleId);

        if (!role) {
          return res.status(404).json({ error: 'Team role not found' });
        }

        // Get members with this role
        const teamMembers = [];

        for (const [memberId, member] of guild.members.cache) {
          if (member.roles.cache.has(teamRoleId)) {
            // Fetch user to get banner
            let user;
            try {
              user = await this.client.users.fetch(memberId, { force: true });
            } catch (err) {
              console.error('Error fetching user:', err);
              user = member.user;
            }

            const roles = member.roles.cache
              .filter(r => r.id !== guild.id) // Filter out @everyone
              .map(r => ({
                id: r.id,
                name: r.name,
                color: r.hexColor,
                position: r.position
              }))
              .sort((a, b) => b.position - a.position);

            teamMembers.push({
              id: member.id,
              username: member.user.username,
              displayName: member.displayName,
              globalName: member.user.globalName || member.user.username,
              discriminator: member.user.discriminator,
              avatar: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
              banner: user.bannerURL({ size: 512 }) || null,
              bannerColor: user.hexAccentColor || null,
              nickname: member.nickname,
              joinedAt: member.joinedTimestamp,
              roles: roles,
              isPremium: member.premiumSince ? true : false
            });
          }
        }

        // Sort by highest role position
        teamMembers.sort((a, b) => {
          const aHighestRole = a.roles[0]?.position || 0;
          const bHighestRole = b.roles[0]?.position || 0;
          return bHighestRole - aHighestRole;
        });

        res.json(teamMembers);
      } catch (error) {
        console.error('Error fetching team members:', error);
        res.status(500).json({ error: 'Failed to fetch team members' });
      }
    });
  }

  start(port = 3001) {
    this.server = this.app.listen(port, () => {
      console.log(`🌐 API Server running on http://localhost:${port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('🛑 API Server stopped');
    }
  }
}

module.exports = ApiServer;
