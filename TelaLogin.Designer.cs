/*
 * Created by SharpDevelop.
 * User: giord
 * Date: 15/06/2026
 * Time: 21:31
 * 
 * To change this template use Tools | Options | Coding | Edit Standard Headers.
 */
namespace TelaLogin
{
	partial class TelaLogin
	{
		/// <summary>
		/// Designer variable used to keep track of non-visual components.
		/// </summary>
		private System.ComponentModel.IContainer components = null;
		private System.Windows.Forms.Label label1;
		private System.Windows.Forms.Label label2;
		private System.Windows.Forms.Label label3;
		private System.Windows.Forms.TextBox txtUsuario;
		private System.Windows.Forms.TextBox txtSenha;
		private System.Windows.Forms.Button btnEntrar;
		private System.Windows.Forms.LinkLabel l;
		
		/// <summary>
		/// Disposes resources used by the form.
		/// </summary>
		/// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
		protected override void Dispose(bool disposing)
		{
			if (disposing) {
				if (components != null) {
					components.Dispose();
				}
			}
			base.Dispose(disposing);
		}
		
		/// <summary>
		/// This method is required for Windows Forms designer support.
		/// Do not change the method contents inside the source code editor. The Forms designer might
		/// not be able to load this method if it was changed manually.
		/// </summary>
		private void InitializeComponent()
		{
			this.label1 = new System.Windows.Forms.Label();
			this.label2 = new System.Windows.Forms.Label();
			this.label3 = new System.Windows.Forms.Label();
			this.txtUsuario = new System.Windows.Forms.TextBox();
			this.txtSenha = new System.Windows.Forms.TextBox();
			this.btnEntrar = new System.Windows.Forms.Button();
			this.l = new System.Windows.Forms.LinkLabel();
			this.SuspendLayout();
			// 
			// label1
			// 
			this.label1.AutoSize = true;
			this.label1.Location = new System.Drawing.Point(228, 27);
			this.label1.Name = "label1";
			this.label1.Size = new System.Drawing.Size(47, 18);
			this.label1.TabIndex = 0;
			this.label1.Text = "Login";
			// 
			// label2
			// 
			this.label2.AutoSize = true;
			this.label2.Location = new System.Drawing.Point(51, 101);
			this.label2.Name = "label2";
			this.label2.Size = new System.Drawing.Size(66, 18);
			this.label2.TabIndex = 1;
			this.label2.Text = "Usuário:";
			// 
			// label3
			// 
			this.label3.AutoSize = true;
			this.label3.Location = new System.Drawing.Point(51, 144);
			this.label3.Name = "label3";
			this.label3.Size = new System.Drawing.Size(57, 18);
			this.label3.TabIndex = 2;
			this.label3.Text = "Senha:";
			// 
			// txtUsuario
			// 
			this.txtUsuario.Location = new System.Drawing.Point(140, 101);
			this.txtUsuario.Name = "txtUsuario";
			this.txtUsuario.Size = new System.Drawing.Size(275, 26);
			this.txtUsuario.TabIndex = 3;
			// 
			// txtSenha
			// 
			this.txtSenha.Location = new System.Drawing.Point(140, 144);
			this.txtSenha.Name = "txtSenha";
			this.txtSenha.Size = new System.Drawing.Size(275, 26);
			this.txtSenha.TabIndex = 4;
			// 
			// btnEntrar
			// 
			this.btnEntrar.Location = new System.Drawing.Point(213, 204);
			this.btnEntrar.Name = "btnEntrar";
			this.btnEntrar.Size = new System.Drawing.Size(98, 34);
			this.btnEntrar.TabIndex = 5;
			this.btnEntrar.Text = "Entrar";
			this.btnEntrar.UseVisualStyleBackColor = true;
			this.btnEntrar.Click += new System.EventHandler(this.BtnEntrarClick);
			// 
			// l
			// 
			this.l.ActiveLinkColor = System.Drawing.Color.Blue;
			this.l.AutoSize = true;
			this.l.DisabledLinkColor = System.Drawing.Color.Blue;
			this.l.ForeColor = System.Drawing.Color.Blue;
			this.l.Location = new System.Drawing.Point(150, 252);
			this.l.Name = "l";
			this.l.Size = new System.Drawing.Size(193, 18);
			this.l.TabIndex = 6;
			this.l.TabStop = true;
			this.l.Text = "Clique aqui para cadastrar";
			this.l.VisitedLinkColor = System.Drawing.Color.Blue;
			// 
			// TelaLogin
			// 
			this.AutoScaleDimensions = new System.Drawing.SizeF(9F, 18F);
			this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
			this.ClientSize = new System.Drawing.Size(551, 328);
			this.Controls.Add(this.l);
			this.Controls.Add(this.btnEntrar);
			this.Controls.Add(this.txtSenha);
			this.Controls.Add(this.txtUsuario);
			this.Controls.Add(this.label3);
			this.Controls.Add(this.label2);
			this.Controls.Add(this.label1);
			this.Font = new System.Drawing.Font("Arial", 12F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point, ((byte)(0)));
			this.FormBorderStyle = System.Windows.Forms.FormBorderStyle.FixedSingle;
			this.Margin = new System.Windows.Forms.Padding(4);
			this.MaximizeBox = false;
			this.MinimizeBox = false;
			this.Name = "TelaLogin";
			this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
			this.Text = "Tela Login";
			this.ResumeLayout(false);
			this.PerformLayout();

		}
	}
}
