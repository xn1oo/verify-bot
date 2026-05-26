const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const VERIFIED_ROLE_IDS = ['1507971266114748446', '1508294075588149349'];
const REQUIRED_GAME_ID = 7171174521;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const verified = {};

const commands = [
  new SlashCommandBuilder()
    .setName('setupverify')
    .setDescription('Post the verification button (Staff only)')
    .toJSON(),
];

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commands registered.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

async function getRobloxUser(username) {
  try {
    const res = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
    const data = await res.json();
    if (data.data && data.data.length > 0) {
      return data.data[0];
    }
    return null;
  } catch (e) {
    console.error('Roblox user lookup failed:', e);
    return null;
  }
}

async function hasFavoritedGame(robloxUserId, gameId) {
  try {
    let cursor = '';
    for (let i = 0; i < 3; i++) {
      const url = `https://games.roblox.com/v2/users/${robloxUserId}/favorite/games?limit=50&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.data) break;
      const found = data.data.some(g => g.id === gameId || g.rootPlaceId === gameId);
      if (found) return true;
      if (!data.nextPageCursor) break;
      cursor = data.nextPageCursor;
    }
    return false;
  } catch (e) {
    console.error('Favorites check failed:', e);
    return false;
  }
}

client.on('interactionCreate', async interaction => {

  if (interaction.isChatInputCommand() && interaction.commandName === 'setupverify') {
    const isStaff = interaction.member.permissions.has('ManageGuild');
    if (!isStaff) return interaction.reply({ content: '❌ No permission.', ephemeral: true });

    const button = new ButtonBuilder()
      .setCustomId('open_verify')
      .setLabel('✅ Verify with Roblox')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    const embed = new EmbedBuilder()
      .setTitle('✅ Roblox Verification')
      .setDescription(
        'Click the button below to verify your Roblox account and gain access to the server!\n\n' +
        '**Before verifying, make sure you have:**\n' +
        '⭐ Favorited this game on Roblox:\n' +
        '**[American Plains Mudding](https://www.roblox.com/games/7171174521/American-Plains-Mudding)**\n\n' +
        '**Steps:**\n' +
        '1. Go to the game link above\n' +
        '2. Click the ⭐ **Favorite** button on the game page\n' +
        '3. Come back here and click **Verify with Roblox**\n' +
        '4. Enter your Roblox username\n\n' +
        '⚠️ **WARNING:** If we find out you are using a false Roblox username this will result in an **immediate permanent ban** from the server.'
      )
      .setColor('#00FF7F')
      .setFooter({ text: 'Maryland State Roleplay • Verification' });

    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '✅ Verification message posted!', ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'open_verify') {
    if (verified[interaction.user.id]) {
      return interaction.reply({
        content: `❌ You are already verified as **@${verified[interaction.user.id]}** on Roblox.`,
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('verify_modal')
      .setTitle('✅ Roblox Verification');

    const usernameInput = new TextInputBuilder()
      .setCustomId('roblox_username')
      .setLabel('Roblox Username')
      .setPlaceholder('Enter your exact Roblox username')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));
    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'verify_modal') {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.fields.getTextInputValue('roblox_username').trim();

    const robloxUser = await getRobloxUser(username);
    if (!robloxUser) {
      return interaction.editReply({
        content: `❌ The Roblox username **${username}** does not exist. Please check your username and try again.`
      });
    }

    const hasFav = await hasFavoritedGame(robloxUser.id, REQUIRED_GAME_ID);
    if (!hasFav) {
      return interaction.editReply({
        content:
          `❌ You have not favorited the required game!\n\n` +
          `Please go to **[American Plains Mudding](https://www.roblox.com/games/7171174521/American-Plains-Mudding)** and click the ⭐ **Favorite** button, then try verifying again.\n\n` +
          `> Make sure your **Favorites are set to Public** in your Roblox privacy settings!`
      });
    }

    try {
      const member = interaction.member;
      for (const roleId of VERIFIED_ROLE_IDS) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) await member.roles.add(role);
      }
    } catch (e) {
      console.error('Failed to add roles:', e);
      return interaction.editReply({ content: '❌ Failed to give you the verified role. Please contact a staff member.' });
    }

    try {
      const discordDisplay = interaction.user.displayName || interaction.user.username;
      const newNick = `${discordDisplay} (@${robloxUser.name})`;
      await interaction.member.setNickname(newNick.slice(0, 32));
    } catch (e) {
      console.error('Failed to set nickname:', e);
    }

    verified[interaction.user.id] = robloxUser.name;

    return interaction.editReply({
      content:
        `✅ You have been successfully verified!\n\n` +
        `**Roblox:** @${robloxUser.name}\n` +
        `**Display Name:** ${robloxUser.displayName}\n\n` +
        `You now have access to the rest of the server. Welcome! 🎉`
    });
  }
});

client.login(TOKEN);
