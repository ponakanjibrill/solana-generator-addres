require('dotenv').config({ path: './data.env' });

const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');

const privateKeyBase58 = process.env.PRIVATE_KEY;
const recipientAddress = process.env.RECIPIENT_ADDRESS;

if (!privateKeyBase58 || !recipientAddress) {
  console.log('Private key or recipient address is missing in environment variables.');
  process.exit(1);
}

const privateKeyBytes = bs58.decode(privateKeyBase58);

if (privateKeyBytes.length !== 64) {
  console.log('Invalid private key size. It must be 64 bytes.');
  process.exit(1);
}

const senderAccount = Keypair.fromSecretKey(privateKeyBytes);

// Hardcoded choice of network (0 for Devnet, 1 for Mainnet)
const networkChoice = '0';  // Change this value to '1' for Mainnet

let rpcUrl;
if (networkChoice === '0') {
  rpcUrl = "https://api.devnet.solana.com";
  console.log("Selected Devnet.");
} else if (networkChoice === '1') {
  rpcUrl = "https://api.mainnet-beta.solana.com";
  console.log("Selected Mainnet.");
} else {
  console.log('Invalid selection. Exiting...');
  process.exit(1);
}

const connection = new Connection(rpcUrl, 'confirmed');

let recipientPublicKey;
try {
  recipientPublicKey = new PublicKey(recipientAddress);
} catch (error) {
  console.log('Invalid recipient address:', recipientAddress);
  process.exit(1);
}

async function getBalance(account) {
  try {
    const solBalance = await connection.getBalance(account.publicKey);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(account.publicKey, {
      programId: TOKEN_PROGRAM_ID
    });

    const tokenBalances = tokenAccounts.value.map((tokenAccount) => {
      const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
      const mintAddress = tokenAccount.account.data.parsed.info.mint;
      return { mint: mintAddress, amount: tokenAmount.amount };
    });

    return { solBalance, tokenBalances };
  } catch (error) {
    console.log('Error fetching balance:', error);
    process.exit(1);
  }
}

async function sendSOL(senderAccount, recipientPublicKey, amount) {
  try {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderAccount.publicKey,
        toPubkey: recipientPublicKey,
        lamports: amount,
      })
    );

    const signature = await connection.sendTransaction(transaction, [senderAccount]);
    await connection.confirmTransaction(signature);
    console.log(`SOL Transaction successful: ${signature}`);
    return signature;
  } catch (error) {
    console.log('Error sending SOL:', error);
    return null;
  }
}

async function sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount) {
  try {
    const token = new Token(connection, new PublicKey(mintAddress), TOKEN_PROGRAM_ID, senderAccount);
    const senderTokenAccount = await token.getOrCreateAssociatedAccountInfo(senderAccount.publicKey);
    const recipientTokenAccount = await token.getOrCreateAssociatedAccountInfo(recipientPublicKey);

    const transaction = new Transaction().add(
      token.transfer(
        senderTokenAccount.address,
        recipientTokenAccount.address,
        senderAccount.publicKey,
        [],
        amount
      )
    );

    const signature = await connection.sendTransaction(transaction, [senderAccount]);
    await connection.confirmTransaction(signature);
    console.log(`SPL Token Transaction successful: ${signature}`);
    return signature;
  } catch (error) {
    console.log('Error sending SPL token:', error);
    return null;
  }
}

async function processAccount() {
  const balance = await getBalance(senderAccount);
  console.log(`Account balance: ${balance.solBalance / LAMPORTS_PER_SOL} SOL`);
  console.log('Account SPL Token Balances:');

  balance.tokenBalances.forEach(token => {
    console.log(`- Mint: ${token.mint}, Amount: ${token.amount}`);
  });

  const solAmountToSend = balance.solBalance - 1000;
  if (solAmountToSend > 0) {
    console.log(`Sending ${solAmountToSend / LAMPORTS_PER_SOL} SOL to ${recipientPublicKey.toBase58()}`);
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, solAmountToSend);
    if (solResponse) {
      console.log(`SOL Transaction successful.`);
    }
  }

  for (const token of balance.tokenBalances) {
    const splAmountToSend = token.amount;
    if (splAmountToSend > 0) {
      console.log(`Sending ${splAmountToSend} tokens (Mint: ${token.mint}) to ${recipientPublicKey.toBase58()}`);
      const splResponse = await sendSPLToken(senderAccount, recipientPublicKey, token.mint, splAmountToSend);
      if (splResponse) {
        console.log(`SPL Token Transaction successful.`);
      }
    }
  }

  const updatedBalance = await getBalance(senderAccount);
  console.log(`Updated Account balance: ${updatedBalance.solBalance / LAMPORTS_PER_SOL} SOL`);
  console.log('Updated Account SPL Token Balances:');
  updatedBalance.tokenBalances.forEach(token => {
    console.log(`- Mint: ${token.mint}, Amount: ${token.amount}`);
  });
}

function startBot() {
  setInterval(async () => {
    await processAccount();
  }, 5000);
}

startBot();
