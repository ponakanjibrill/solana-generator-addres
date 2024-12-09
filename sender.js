require('dotenv').config({ path: './data.env' }); // Automatically load from data.env
const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58'); // Import the bs58 library

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

// Set up Solana connection (use "devnet" for testing, "mainnet-beta" for production)
const connection = new Connection("https://api.devnet.solana.com", 'confirmed');

// Convert recipient address to PublicKey
let recipientPublicKey;
try {
  recipientPublicKey = new PublicKey(recipientAddress);
} catch (error) {
  console.log('Invalid recipient address:', recipientAddress);
  process.exit(1);
}

// Function to get balance of an account
async function getBalance(account) {
  try {
    const balance = await connection.getBalance(account.publicKey);
    return balance;
  } catch (error) {
    console.log('Error fetching balance:', error);
    process.exit(1);
  }
}

// Function to send tokens from sender to recipient
async function sendTokens(senderAccount, recipientPublicKey, amount) {
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
    return signature;
  } catch (error) {
    console.log('Error sending transaction:', error);
    process.exit(1);
  }
}

// Main function to process the account
async function processAccount() {
  // Get balance of the account
  const balance = await getBalance(senderAccount);
  console.log(`Account ${senderAccount.publicKey.toBase58()} balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // Check if balance is sufficient (example: minimum 1 SOL)
  if (balance >= 1 * LAMPORTS_PER_SOL) {  // 1 SOL = 1,000,000,000 lamports
    const amountToSend = balance - 0.5 * LAMPORTS_PER_SOL;  // Send all except 0.5 SOL
    console.log(`Sending ${amountToSend / LAMPORTS_PER_SOL} SOL from account ${senderAccount.publicKey.toBase58()} to ${recipientPublicKey.toBase58()}`);
    const response = await sendTokens(senderAccount, recipientPublicKey, amountToSend);
    console.log(`Transaction response: ${response}`);
  } else {
    console.log(`Insufficient funds to send from ${senderAccount.publicKey.toBase58()}`);
  }
}

// Run the process every 10 seconds
async function startBot() {
  while (true) {
    await processAccount();
    await sleep(10000);  // Wait for 10 seconds before checking again
  }
}

startBot();

// Helper function to pause execution for a specified time (in milliseconds)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
