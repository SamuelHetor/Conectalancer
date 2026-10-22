using System;
using System.Windows.Forms;
using MySql.Data.MySqlClient;

namespace TelaLogin
{
    public partial class TelaCadastro : Form
    {
        public TelaCadastro()
        {
            InitializeComponent();
        }

        void BtnCadastrarClick(object sender, EventArgs e)
        {
            if (txtUsuario.Text != "" && txtSenha.Text != "")
            {
                string conexaoBanco =
                "server=localhost;port=3306;database=sistema_clientes;uid=root;pwd='';";

                MySqlConnection conn = new MySqlConnection(conexaoBanco);

                try
                {
                    conn.Open();

                    // verifica se usuário já existe
                    string checkSql =
                    "SELECT COUNT(*) FROM usuarios WHERE usuario=@usuario";

                    MySqlCommand checkCmd = new MySqlCommand(checkSql, conn);
                    checkCmd.Parameters.AddWithValue("@usuario", txtUsuario.Text);

                    int existe = Convert.ToInt32(checkCmd.ExecuteScalar());

                    if (existe > 0)
                    {
                        MessageBox.Show("Usuário já existe!");
                        return;
                    }

                    // cadastra usuário como cliente
                    string sql =
                    "INSERT INTO usuarios (usuario, senha, tipo) VALUES (@usuario, @senha, 'cliente')";

                    MySqlCommand cmd = new MySqlCommand(sql, conn);

                    cmd.Parameters.AddWithValue("@usuario", txtUsuario.Text);
                    cmd.Parameters.AddWithValue("@senha", txtSenha.Text);

                    cmd.ExecuteNonQuery();

                    MessageBox.Show("Cadastro realizado com sucesso!");

                    txtUsuario.Clear();
                    txtSenha.Clear();

                    TelaLogin login = new TelaLogin();
                    login.Show();
                    this.Hide();
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
                MessageBox.Show("Preencha usuário e senha!");
            }
        }
    }
}