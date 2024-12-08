import os
import base64
from solana.account import Account
from solana.rpc.api import Client
from solana.transaction import Transaction
from solana.system_program import TransferParams, transfer
from solana.publickey import PublicKey
from solana.rpc.types import TxOpts
from dotenv import load_dotenv
import time

# Load environment variables
load_dotenv()

# Get private keys from the .env file (assuming they are base64 encoded)
private_keys = eval(os.getenv("PRIVATE_KEYS"))

# The recipient address
recipient_address = os.getenv("RECIPIENT_ADDRESS")

# Connect to Solana cluster (using devnet for testing, change to mainnet or testnet as needed)
client = Client("https://api.devnet.solana.com")

def get_balance(account: Account):
    """
    Get the balance of a wallet
    """
    balance = client.get_balance(account.public_key)
    return balance['result']['value']

def send_tokens(sender_account: Account, recipient_address: str, amount: int):
    """
    Send tokens from sender to recipient
    """
    transaction = Transaction()
    transfer_instruction = transfer(
        TransferParams(
            from_pubkey=sender_account.public_key(),
            to_pubkey=PublicKey(recipient_address),
            lamports=amount,
        )
    )
    transaction.add(transfer_instruction)
    response = client.send_transaction(transaction, sender_account, opts=TxOpts(skip_preflight=True))
    return response

def process_accounts():
    """
    Process each account by checking balance and sending tokens if sufficient balance exists
    """
    for private_key_base64 in private_keys:
        # Decode the private key from base64
        private_key_bytes = base64.b64decode(private_key_base64)
        sender_account = Account(private_key_bytes)
        
        # Get the balance of the account
        balance = get_balance(sender_account)
        
        print(f"Account {sender_account.public_key()} balance: {balance} lamports")
        
        # Check if balance is sufficient (example: minimum 1 SOL)
        if balance >= 1_000_000_000:  # 1 SOL = 1,000,000,000 lamports
            amount_to_send = balance - 500_000_000  # Example: send all except 0.5 SOL
            print(f"Sending {amount_to_send / 1_000_000_000} SOL from account {sender_account.public_key()} to {recipient_address}")
            response = send_tokens(sender_account, recipient_address, amount_to_send)
            print(f"Transaction response: {response}")
        else:
            print(f"Insufficient funds to send from {sender_account.public_key()}")

# Run the process
while True:
    process_accounts()
    time.sleep(10)  # Wait 10 seconds before checking again

