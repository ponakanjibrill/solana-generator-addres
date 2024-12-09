require('dotenv').config({ path: './data.env' }); // Automatically load from data.env

const readlineSync = require('readline-sync'); // Import readline-sync for user input
const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58'); // Ensure bs58 is properly imported
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token'); // Import SPL Token library

// Read the private key from the .env file as a Base58 string
const privateKeyBase58 = process.env.PRIVATE_KEY;
const recipientAddress = process.env.RECIPIENT_ADDRESS;

// Ensure the private key and recipient address are provided in the .env file
if (!privateKeyBase58 || !recipientAddress) {
  console.log('Private key or recipient address is missing in environment variables.');
  process.exit(1);
}

// Convert the Base58 private key string to a Uint8Array
const privateKeyBytes = bs58.decode(privateKeyBase58); // Decodes the Base58 private key

// Check if private key size is valid (64 bytes)
if (privateKeyBytes.length !== 64) {
  console.log('Invalid private key size. It must be 64 bytes.');
  process.exit(1);
}

// Create Keypair from the raw private key
const senderAccount = Keypair.fromSecretKey(privateKeyBytes);

// Prompt user for the network (Devnet or Mainnet)
const networkChoice = readlineSync.question('Select the network (0 for Devnet, 1 for Mainnet): ');

let rpcUrl;
if (networkChoice === '0') {
  // Devnet RPC URL
  rpcUrl = "https://api.devnet.solana.com";
  console.log("Selected Devnet.");
} else if (networkChoice === '1') {
  // Mainnet RPC URL
  rpcUrl = "https://api.mainnet-beta.solana.com";
  console.log("Selected Mainnet.");
} else {
  console.log('Invalid selection. Exiting...');
  process.exit(1);
}

// Set up Solana connection
const connection = new Connection(rpcUrl, 'confirmed');

// Convert recipient address to PublicKey
let recipientPublicKey;
try {
  recipientPublicKey = new PublicKey(recipientAddress);
} catch (error) {
  console.log('Invalid recipient address:', recipientAddress);
  process.exit(1);
}

// Function to get balance of an account (both SOL and SPL tokens)
async function getBalance(account) {
  try {
    // Fetch the balance of SOL
    const solBalance = await connection.getBalance(account.publicKey);

    // Fetch the balance of all SPL tokens associated with the sender's wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(account.publicKey, {
      programId: TOKEN_PROGRAM_ID
    });

    // Collect all token balances
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

// Function to send SOL tokens from sender to recipient
async function sendSOL(senderAccount, recipientPublicKey, amount) {
  try {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderAccount.publicKey,
        toPubkey: recipientPublicKey,
        lamports: amount,
      })
    );

    // Send the transaction
    const signature = await connection.sendTransaction(transaction, [senderAccount]);
    await connection.confirmTransaction(signature);
    console.log(`SOL Transaction successful: ${signature}`);
    return signature;
  } catch (error) {
    console.log('Error sending SOL:', error);
    return null;
  }
}

// Function to send SPL tokens from sender to recipient
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

    // Send the transaction
    const signature = await connection.sendTransaction(transaction, [senderAccount]);
    await connection.confirmTransaction(signature);
    console.log(`SPL Token Transaction successful: ${signature}`);
    return signature;
  } catch (error) {
    console.log('Error sending SPL token:', error);
    return null;
  }
}

// Main function to process the account and send SOL or SPL tokens
async function processAccount() {
  const balance = await getBalance(senderAccount);
  console.log(`Account balance: ${balance.solBalance / LAMPORTS_PER_SOL} SOL`);
  console.log('Account SPL Token Balances:');
  
  // List each SPL token balance
  balance.tokenBalances.forEach(token => {
    console.log(`- Mint: ${token.mint}, Amount: ${token.amount}`);
  });

  // Send SOL (if balance is more than 1000 lamports)
  const solAmountToSend = balance.solBalance - 1000; // Send all except 1000 lamports (0.000001 SOL)
  if (solAmountToSend > 0) {
    console.log(`Sending ${solAmountToSend / LAMPORTS_PER_SOL} SOL to ${recipientPublicKey.toBase58()}`);
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, solAmountToSend);
    if (solResponse) {
      console.log(`SOL Transaction successful.`);
    }
  }

  // Send each SPL token found in the wallet
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

  // Fetch the balance again after the transaction
  const updatedBalance = await getBalance(senderAccount);
  console.log(`Updated Account balance: ${updatedBalance.solBalance / LAMPORTS_PER_SOL} SOL`);
  console.log('Updated Account SPL Token Balances:');
  updatedBalance.tokenBalances.forEach(token => {
    console.log(`- Mint: ${token.mint}, Amount: ${token.amount}`);
  });
}

// Run the process periodically with a delay (throttling CPU usage)
function startBot() {
  setInterval(async () => {
    await processAccount(); // Process account every 5 seconds (5000 ms)
  }, 5000); // 5 seconds delay
}

startBot();
