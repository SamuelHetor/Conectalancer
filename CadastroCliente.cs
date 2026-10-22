using System;
using System.Windows.Forms;
using MySql.Data.MySqlClient;

namespace TelaLogin
{
    public partial class CadastroCliente : Form
    {
        public CadastroCliente()
        {
            InitializeComponent();
        }

        private void CadastroCliente_Load(object sender, EventArgs e)
        {
            if (Sessao.Tipo != "admin")
            {
                MessageBox.Show("Acesso negado!");
                this.Close();
            }
        }

        private void btnCadastrar_Click(object sender, EventArgs e)
        {
            string conexaoBanco =
            "server=localhost;port=3306;database=sistema_clientes;uid=root;pwd='';";

            if (txtNome.Text != "" &&
                txtTelefone.Text != "" &&
                txtEmail.Text != "")
            {
                MySqlConnection conn = new MySqlConnection(conexaoBanco);

                try
                {
                    conn.Open();

                    string sql =
                    @"INSERT INTO clientes
                    (nome_cliente, telefone, email, endereco, observacao)
                    VALUES
                    (@nome, @telefone, @email, @endereco, @obs)";

                    MySqlCommand cmd = new MySqlCommand(sql, conn);

                    cmd.Parameters.AddWithValue("@nome", txtNome.Text);
                    cmd.Parameters.AddWithValue("@telefone", txtTelefone.Text);
                    cmd.Parameters.AddWithValue("@email", txtEmail.Text);
                    cmd.Parameters.AddWithValue("@endereco", txtEndereco.Text);
                    cmd.Parameters.AddWithValue("@obs", txtObservacao.Text);

                    cmd.ExecuteNonQuery();

                    MessageBox.Show("Cliente cadastrado com sucesso!");

                    txtNome.Clear();
                    txtTelefone.Clear();
                    txtEmail.Clear();
                    txtEndereco.Clear();
                    txtObservacao.Clear();
                }
                catch (Exception ex)
                {
                    MessageBox.Show("Erro: " + ex.Message);
                }
                finally
                {
                    conn.Close();
                }
            }
            else
            {
                MessageBox.Show("Preencha os campos obrigatórios!");
            }
        }
    }
}